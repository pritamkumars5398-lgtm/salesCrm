"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import type { Page } from "@/store/types";
import { VALID_PAGES } from "@/lib/constants/pages";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import ConversationDrawer from "@/components/drawer/ConversationDrawer";
import ToastContainer from "@/components/ui/Toast";
import AddLeadModal from "@/components/ui/AddLeadModal";
import SyncPanel, { type SyncRun } from "@/components/ui/SyncPanel";
import Landing from "@/components/pages/Landing";
import Profile from "@/components/pages/Profile";

import Dashboard from "@/components/pages/Dashboard";
import Leads from "@/components/pages/Leads";
import Sequence from "@/components/pages/Sequence";
import CRM from "@/components/pages/CRM";
import Calendar from "@/components/pages/Calendar";
import Activity from "@/components/pages/Activity";
import Settings from "@/components/pages/Settings";
import Crons from "@/components/pages/Crons";
import Plans from "@/components/pages/Plans";
import Superadmin from "@/components/pages/Superadmin";

// Intercept fetch calls on the frontend to log API calls (dev only)
if (process.env.NODE_ENV === "development" && typeof window !== "undefined" && !(window as any).__fetch_intercepted__) {
  (window as any).__fetch_intercepted__ = true;
  const originalFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const url = input.toString();
    const method = init?.method || "GET";
    const startTime = performance.now();

    console.log(
      `%c[API Request] %c${method} %c${url}`,
      "color: #6366f1; font-weight: bold;",
      "color: #3b82f6; font-weight: bold;",
      "color: #94a3b8;"
    );

    if (init?.body) {
      try {
        console.log("[API Request Body]", JSON.parse(init.body.toString()));
      } catch {
        console.log("[API Request Body]", init.body);
      }
    }

    try {
      const response = await originalFetch(input, init);
      const duration = (performance.now() - startTime).toFixed(1);
      const statusColor = response.ok ? "color: #10b981; font-weight: bold;" : "color: #ef4444; font-weight: bold;";

      console.log(
        `%c[API Response] %c${method} %c${url} %c${response.status} (${duration}ms)`,
        "color: #6366f1; font-weight: bold;",
        "color: #3b82f6; font-weight: bold;",
        "color: #94a3b8;",
        statusColor
      );

      const clone = response.clone();
      clone.json()
        .then((data) => {
          console.log("[API Response Data]", data);
        })
        .catch(() => { });

      return response;
    } catch (error) {
      console.error(
        `%c[API Request Failed] %c${method} %c${url}`,
        "color: #ef4444; font-weight: bold;",
        "color: #3b82f6; font-weight: bold;",
        "color: #ef4444;",
        error
      );
      throw error;
    }
  };
}

interface PageProps {
  params: Promise<{ page: string; agentId: string }>;
}

export default function Home({ params }: PageProps) {
  const resolvedParams = use(params);
  const pageParam = resolvedParams.page;
  const agentIdParam = resolvedParams.agentId;

  const router = useRouter();
  const { currentPage, setPage, agents, activeAgent, setAgents, setActiveAgent, showToast, isAuthed, login, userEmail, setLeads } = useAppStore();
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [syncPanelOpen, setSyncPanelOpen] = useState(false);

  // Sync route param changes to Zustand store
  useEffect(() => {
    if (pageParam && currentPage !== pageParam) {
      if ((VALID_PAGES as string[]).includes(pageParam)) {
        setPage(pageParam as Page);
      }
    }
  }, [pageParam, currentPage, setPage]);

  useEffect(() => {
    if (agents.length > 0 && agentIdParam) {
      const match = agents.find((a) => a._id === agentIdParam);
      if (match) {
        if (activeAgent?._id !== agentIdParam) {
          setActiveAgent(match);
        }
      } else {
        // Fallback to first agent if ID is invalid
        setActiveAgent(agents[0]);
        router.replace(`/${pageParam || "dashboard"}/${agents[0]._id}`);
      }
    }
  }, [agentIdParam, agents, activeAgent?._id, pageParam, setActiveAgent, router]);

  useEffect(() => {
    const stored = localStorage.getItem("sa_user");
    if (!stored) {
      router.replace("/");
      return;
    }
    let user: { name: string; email: string };
    try {
      user = JSON.parse(stored);
      login(user.name, user.email);
    } catch {
      localStorage.removeItem("sa_user");
      router.replace("/");
      return;
    }
    setMounted(true);

    fetch(`/api/agents?email=${encodeURIComponent(user.email)}`)
      .then((r) => r.json())
      .then(async (agentsList) => {
        let finalAgents = agentsList;
        if (agentsList.length === 0) {
          const onboardingRaw = localStorage.getItem("sa_onboarding");
          let onboarding: any = null;
          if (onboardingRaw) {
            try {
              onboarding = JSON.parse(onboardingRaw);
            } catch (e) {
              console.error("[onboarding parse error]", e);
            }
          }

          const agentName = onboarding?.businessName || "Carpenter Agent";

          const a = await fetch("/api/agents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: agentName, userEmail: user.email }),
          }).then((r) => r.json());

          // Seed settings + demo leads
          await Promise.all([
            fetch("/api/settings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                agentId: a._id,
                settings: {
                  businessType: "Other",
                  industry: agentName.toLowerCase(),
                  gmKeyword: agentName.toLowerCase(),
                  gmLocation: "Lucknow",
                  gmMaxResults: "25",
                  gmActorId: "nwua9Gu5YrADL7ZD",
                  activeScraperType: "google-maps",
                  "google-mapsEnabled": "true",
                  leadLocation: "Lucknow",
                  targetCompanySize: "Any",
                  apifyToken: process.env.NEXT_PUBLIC_APIFY_TOKEN || "",
                  apifyScraper: "Google Maps businesses",
                  apifyActorId: "nwua9Gu5YrADL7ZD",
                  llmProvider: "Claude (Anthropic)",
                  whatsappEnabled: "true",
                  emailEnabled: "true",
                  smsEnabled: "true",
                  voiceEnabled: "true",
                  // Seeded onboarding values
                  businessWebsite: onboarding?.businessWebsite || "",
                  businessPhone: onboarding?.businessPhone || "",
                  businessServices: onboarding?.businessServices || "",
                  docLink: onboarding?.docLink || "",
                  customPrompt: onboarding?.customPrompt || "",
                  followUpDays: onboarding?.followUpDays || "3",
                },
              }),
            }),
            fetch("/api/seed", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agentId: a._id }),
            }),
          ]);

          localStorage.removeItem("sa_onboarding");
          finalAgents = [{ ...a, leadCount: 10 }];
        }

        setAgents(finalAgents);

        // Sync initial agent
        const match = finalAgents.find((a: any) => a._id === agentIdParam);
        if (match) {
          setActiveAgent(match);
        } else if (finalAgents.length > 0) {
          setActiveAgent(finalAgents[0]);
          router.replace(`/${pageParam || "dashboard"}/${finalAgents[0]._id}`);
        }
      })
      .catch(() => showToast("Could not connect to database", "error"));
  }, []);

  function patchRun(runId: string, patch: Partial<SyncRun>) {
    setSyncRuns((prev) => prev.map((r) => r.runId === runId ? { ...r, ...patch } : r));
  }

  async function handleSyncApify() {
    const agentId = useAppStore.getState().activeAgent?._id;
    if (!agentId) return;
    setSyncing(true);
    setSyncRuns([]);
    setSyncPanelOpen(true);

    try {
      const startRes = await fetch("/api/apify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
      const start = await startRes.json();
      if (!startRes.ok) {
        setSyncPanelOpen(false);
        if (start.limitReached) {
          showToast("Lead limit reached — upgrade your plan", "error");
          router.push(`/plans/${agentId}`);
        } else {
          showToast(start.error ?? "Apify start failed", "error");
        }
        return;
      }

      const runs = start.runs as { runId: string; datasetId: string; search: string; scraperType: string }[];
      if (start.warnings?.length) start.warnings.forEach((w: string) => showToast(w, "error"));

      // Seed panel with one row per run
      setSyncRuns(runs.map((r) => ({
        runId: r.runId,
        search: r.search,
        scraperType: r.scraperType,
        status: "polling",
        itemCount: 0,
        imported: 0,
      })));

      const deadline = Date.now() + 3 * 60 * 1000;
      const completed = await Promise.all(
        runs.map(async ({ runId, datasetId, scraperType }) => {
          let finalStatus = "";
          while (Date.now() < deadline) {
            await new Promise((res) => setTimeout(res, 6000));
            const poll = await fetch(`/api/apify?runId=${runId}&agentId=${agentId}`).then((r) => r.json());
            finalStatus = poll.status as string;
            patchRun(runId, { itemCount: poll.itemCount ?? 0 });
            if (finalStatus === "SUCCEEDED" || ["FAILED", "ABORTED", "TIMED-OUT"].includes(finalStatus)) break;
          }
          return { runId, datasetId, scraperType, finalStatus };
        })
      );

      for (const { runId, datasetId, scraperType, finalStatus } of completed) {
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

      // Re-fetch agents to update lead counts
      fetch(`/api/agents?email=${encodeURIComponent(userEmail)}`)
        .then((r) => r.json())
        .then((agentsList) => {
          setAgents(agentsList);
          const match = agentsList.find((a: any) => a._id === agentId);
          if (match) setActiveAgent(match);
        })
        .catch(() => { });

      // If on Leads page, reload the leads
      if (currentPage === "leads") {
        fetch(`/api/leads?agentId=${agentId}`)
          .then((r) => r.json())
          .then((data) => setLeads(data))
          .catch(() => { });
      }
    } catch (err) {
      showToast("Apify sync failed — check console", "error");
      console.error("[Apify sync]", err);
      setSyncRuns((prev) => prev.map((r) =>
        r.status !== "done" ? { ...r, status: "failed", error: "Unexpected error" } : r
      ));
    } finally {
      setSyncing(false);
    }
  }

  if (!mounted) {
    return (
      <div
        className="flex h-screen items-center justify-center bg-slate-950 text-slate-100"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-500 animate-ping opacity-75" />
          <div className="text-sm font-semibold tracking-wide text-slate-400">Loading SalesAgent...</div>
        </div>
      </div>
    );
  }

  if (!isAuthed) {
    return (
      <>
        <div className="h-screen overflow-y-auto">
          <Landing onAuth={(name, email) => login(name, email)} />
        </div>
        <ToastContainer />
      </>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar onAddLead={() => setAddLeadOpen(true)} onSyncApify={handleSyncApify} syncing={syncing} />

        <div className="flex flex-1 overflow-hidden">
          {/* Main content */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            {currentPage === "dashboard" && <Dashboard />}
            {currentPage === "leads" && <Leads onAddLead={() => setAddLeadOpen(true)} />}
            {currentPage === "sequence" && <Sequence />}
            {currentPage === "crm" && <CRM />}
            {currentPage === "calendar" && <Calendar />}
            {currentPage === "activity" && <Activity />}
            {currentPage === "settings" && <Settings />}
            {currentPage === "crons" && <Crons />}
            {currentPage === "profile" && <Profile />}
            {currentPage === "plans" && <Plans />}
            {currentPage === "superadmin" && (
              userEmail?.toLowerCase() === "admin@salesagent.ai" ? (
                <Superadmin />
              ) : (
                <div style={{ padding: 40, fontFamily: "var(--font-sans)", color: "var(--color-text)" }}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: "#ef4444", marginBottom: 6 }}>Access Denied</h3>
                  <p style={{ fontSize: 13, color: "var(--color-text3)" }}>You do not have permissions to view the superadmin dashboard.</p>
                </div>
              )
            )}
          </div>

          {/* Conversation drawer */}
          <ConversationDrawer />
        </div>
      </div>

      <AddLeadModal open={addLeadOpen} onClose={() => setAddLeadOpen(false)} />
      <SyncPanel runs={syncRuns} open={syncPanelOpen} onClose={() => setSyncPanelOpen(false)} />
      <ToastContainer />
    </div>
  );
}
