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
        const startRes = await fetch("/api/apify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId }),
        });
        const start = await startRes.json();
        if (!startRes.ok) {
          set({ syncPanelOpen: false });
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

        set({
          syncRuns: runs.map((r) => ({
            runId: r.runId,
            search: r.search,
            scraperType: r.scraperType,
            status: "polling",
            itemCount: 0,
            imported: 0,
          })),
        });

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
          if (currentRun?.error === "Cancelled by user") {
            continue;
          }
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

        // Refresh agent lead counts.
        const { userEmail, setAgents, setActiveAgent, currentPage, setLeads } = get();
        fetch(`/api/agents?email=${encodeURIComponent(userEmail)}`)
          .then((r) => r.json())
          .then((agentsList) => {
            setAgents(agentsList);
            const match = agentsList.find((a: { _id: string }) => a._id === agentId);
            if (match) setActiveAgent(match);
          })
          .catch(() => {});

        // If viewing Leads, reload them so new leads appear.
        if (currentPage === "leads") {
          fetch(`/api/leads?agentId=${agentId}`)
            .then((r) => r.json())
            .then((data) => setLeads(data))
            .catch(() => {});
        }
      } catch (err) {
        showToast("Apify sync failed — check console", "error");
        console.error("[Apify sync]", err);
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
