import type { StateCreator } from "zustand";
import type { SyncRun } from "@/components/ui/SyncPanel";
import type { AppState } from "../useAppStore";

export interface SyncSlice {
  syncing: boolean;
  syncRuns: SyncRun[];
  syncPanelOpen: boolean;
  setSyncPanelOpen: (open: boolean) => void;
  /**
   * Runs the full Apify scrape→poll→import flow. Lives in the store (not a page
   * component) so the progress panel keeps updating even when the user switches
   * tabs or navigates — the page can unmount without interrupting the sync.
   */
  runApifySync: (agentId: string, opts?: { onLimitReached?: () => void }) => Promise<void>;
  cancelSyncRun: (agentId: string, runId: string) => Promise<void>;
}

export const createSyncSlice: StateCreator<AppState, [], [], SyncSlice> = (set, get) => {
  const patchRun = (runId: string, patch: Partial<SyncRun>) =>
    set((s) => ({ syncRuns: s.syncRuns.map((r) => (r.runId === runId ? { ...r, ...patch } : r)) }));

  return {
    syncing: false,
    syncRuns: [],
    syncPanelOpen: false,
    setSyncPanelOpen: (syncPanelOpen) => set({ syncPanelOpen }),

    runApifySync: async (agentId, opts = {}) => {
      if (!agentId || get().syncing) return;
      const { showToast } = get();
      set({ syncing: true, syncRuns: [], syncPanelOpen: true });

      try {
        // Fetch agent settings to see what is enabled
        const settingsRes = await fetch(`/api/settings?agentId=${agentId}`);
        const settings = await settingsRes.json();
        
        const isApifyEnabled = settings.apifyScraperEnabled !== "false";
        const providers = [
          { type: "openai", enabled: settings.openaiEnabled === "true", label: "OpenAI ChatGPT" },
          { type: "anthropic", enabled: settings.anthropicEnabled === "true", label: "Anthropic Claude" },
          { type: "gemini", enabled: settings.geminiEnabled === "true", label: "Google Gemini" }
        ];

        // 1. Kick off LLM requests (if any)
        const llmPromises = providers
          .filter(p => p.enabled)
          .map(async (provider) => {
            const runId = `llm-${provider.type}-${Date.now()}`;
            // Add a pending run to the store
            set((s) => ({
              syncRuns: [
                ...s.syncRuns,
                { runId, search: `LLM: ${provider.label}`, scraperType: "AI Generation", status: "polling", itemCount: 0, imported: 0 }
              ]
            }));

            try {
              patchRun(runId, { status: "importing", itemCount: 0 }); // LLMs run instantly and then import
              const res = await fetch("/api/llm-scraper", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ agentId, providerType: provider.type })
              });
              const json = await res.json();
              if (!res.ok) throw new Error(json.error || "LLM request failed");
              patchRun(runId, { status: "done", itemCount: json.imported, imported: json.imported });
              const toastMsg = json.message || `${provider.label} generated ${json.imported} leads!`;
              showToast(toastMsg, json.imported === 0 ? "error" : "success");
            } catch (err: any) {
              patchRun(runId, { status: "failed", error: err.message });
              showToast(`${provider.label} Failed: ${err.message}`, "error");
            }
          });

        // 2. Kick off Apify request (if enabled)
        let apifyPromise = Promise.resolve();
        if (isApifyEnabled) {
          apifyPromise = (async () => {
            const startRes = await fetch("/api/apify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agentId }),
            });
            const start = await startRes.json();
            if (!startRes.ok) {
              if (start.limitReached) {
                showToast("Lead limit reached — upgrade your plan", "error");
                opts.onLimitReached?.();
              } else {
                showToast(start.error ?? "Apify start failed", "error");
              }
              return;
            }

            const runs = start.runs as { runId: string; datasetId: string; search: string; scraperType: string }[];
            if (start.warnings?.length) start.warnings.forEach((w: string) => showToast(w, "error"));

            set((s) => ({
              syncRuns: [
                ...s.syncRuns,
                ...runs.map((r) => ({
                  runId: r.runId,
                  search: r.search,
                  scraperType: r.scraperType,
                  status: "polling" as const,
                  itemCount: 0,
                  imported: 0,
                }))
              ],
            }));

            const deadline = Date.now() + 3 * 60 * 1000;
            const completed = await Promise.all(
              runs.map(async ({ runId, datasetId, scraperType }) => {
                let finalStatus = "";
                while (Date.now() < deadline) {
                  await new Promise((res) => setTimeout(res, 6000));
                  const currentRun = get().syncRuns.find((r) => r.runId === runId);
                  if (currentRun?.status === "failed" && currentRun?.error === "Cancelled by user") {
                    finalStatus = "ABORTED";
                    break;
                  }
                  const poll = await fetch(`/api/apify?runId=${runId}&agentId=${agentId}`).then((r) => r.json());
                  finalStatus = poll.status as string;
                  patchRun(runId, { itemCount: poll.itemCount ?? 0 });
                  if (finalStatus === "SUCCEEDED" || ["FAILED", "ABORTED", "TIMED-OUT"].includes(finalStatus)) break;
                }
                return { runId, datasetId, scraperType, finalStatus };
              })
            );

            for (const { runId, datasetId, scraperType, finalStatus } of completed) {
              const currentRun = get().syncRuns.find((r) => r.runId === runId);
              if (currentRun?.error === "Cancelled by user") continue;
              if (finalStatus !== "SUCCEEDED") {
                patchRun(runId, { status: "failed", error: `Run ended: ${finalStatus}` });
                continue;
              }
              patchRun(runId, { status: "importing" });
              const imp = await fetch("/api/apify", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ agentId, datasetId, scraperType }),
              }).then((r) => r.json());
              patchRun(runId, { status: "done", imported: imp.imported ?? 0, error: imp.warning });
              if (imp.warning) showToast(imp.warning, "error");
            }
          })();
        }

        // Wait for all to finish
        await Promise.all([...llmPromises, apifyPromise]);


        // Refresh agent lead counts.
        const { userEmail, setAgents, setActiveAgent } = get();
        fetch(`/api/agents?email=${encodeURIComponent(userEmail)}`)
          .then((r) => r.json())
          .then((agentsList) => {
            setAgents(agentsList);
            const match = agentsList.find((a: { _id: string }) => a._id === agentId);
            if (match) setActiveAgent(match);
          })
          .catch(() => {});

      } catch (err) {
        showToast("Sync failed — check console", "error");
        console.error("[Sync]", err);
        set((s) => ({
          syncRuns: s.syncRuns.map((r) => (r.status !== "done" ? { ...r, status: "failed", error: "Unexpected error" } : r)),
        }));
      } finally {
        set({ syncing: false });
      }
    },

    cancelSyncRun: async (agentId, runId) => {
      const { showToast } = get();
      patchRun(runId, { error: "Cancelling..." });
      // If it's an LLM run, we just mark it as failed locally (we can't easily abort the fetch unless we use AbortController in the store)
      if (runId.startsWith("llm-")) {
        patchRun(runId, { status: "failed", error: "Cancelled by user" });
        return;
      }
      try {
        const res = await fetch("/api/apify", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, runId }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Abort failed");
        }
        patchRun(runId, { status: "failed", error: "Cancelled by user" });
        showToast("Scraper run cancelled", "success");
      } catch (err: any) {
        showToast(err.message || "Failed to cancel run", "error");
        patchRun(runId, { error: undefined });
      }
    },
  };
};
