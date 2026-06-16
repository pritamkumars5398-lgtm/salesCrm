"use client";
import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import ConversationDrawer from "@/components/drawer/ConversationDrawer";
import ToastContainer from "@/components/ui/Toast";
import AddLeadModal from "@/components/ui/AddLeadModal";
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

// Intercept fetch calls on the frontend to log API calls
if (typeof window !== "undefined" && !(window as any).__fetch_intercepted__) {
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

      // Log response JSON if possible without blocking
      const clone = response.clone();
      clone.json()
        .then((data) => {
          console.log("[API Response Data]", data);
        })
        .catch(() => {
          // Ignore if response is not JSON
        });

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

export default function Home() {
  const { currentPage, setAgents, showToast, isAuthed, login } = useAppStore();
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    // Restore or seed auth — runs client-side only, no SSR mismatch
    const stored = localStorage.getItem("sa_user");
    if (stored) {
      const user = JSON.parse(stored);
      login(user.name, user.email);
    } else {
      const demo = { name: "hello", email: "hello@gmail.com" };
      localStorage.setItem("sa_user", JSON.stringify(demo));
      login(demo.name, demo.email);
    }
    setMounted(true);

    fetch("/api/agents")
      .then((r) => r.json())
      .then(async (agents) => {
        if (agents.length === 0) {
          const a = await fetch("/api/agents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Carpenter Agent" }),
          }).then((r) => r.json());
          // Seed settings + demo leads
          await Promise.all([
            fetch("/api/settings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                agentId: a._id,
                settings: {
                  businessType:      "Other",
                  industry:          "Carpentry / Home Services",
                  leadLocation:      "Lucknow",
                  targetCompanySize: "Any",
                  apifyToken:        "",
                  apifyScraper:      "Google Maps businesses",
                  apifyActorId:      "nwua9Gu5YrADL7ZD",
                  llmProvider:       "Claude (Anthropic)",
                  whatsappEnabled:   "true",
                  emailEnabled:      "true",
                  smsEnabled:        "true",
                  voiceEnabled:      "true",
                },
              }),
            }),
            fetch("/api/seed", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agentId: a._id }),
            }),
          ]);
          setAgents([{ ...a, leadCount: 10 }]);
        } else {
          setAgents(agents);
        }
      })
      .catch(() => showToast("Could not connect to database", "error"));
  }, []);

  async function handleSyncApify() {
    const agentId = useAppStore.getState().activeAgent?._id;
    if (!agentId) return;
    setSyncing(true);
    try {
      // 1. Start the Apify run
      const startRes = await fetch("/api/apify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
      const start = await startRes.json();
      if (!startRes.ok) { showToast(start.error ?? "Apify start failed", "error"); return; }
      showToast(`Searching "${start.search}" on Google Maps…`);

      // 2. Poll until SUCCEEDED or FAILED (every 6s, up to 3 min)
      const { runId, datasetId } = start as { runId: string; datasetId: string };
      const deadline = Date.now() + 3 * 60 * 1000;
      let finalStatus = "";
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 6000));
        const poll = await fetch(`/api/apify?runId=${runId}&agentId=${agentId}`).then((r) => r.json());
        finalStatus = poll.status as string;
        if (finalStatus === "SUCCEEDED") break;
        if (["FAILED", "ABORTED", "TIMED-OUT"].includes(finalStatus)) break;
      }

      if (finalStatus !== "SUCCEEDED") {
        showToast(`Apify run ended: ${finalStatus}`, "error");
        return;
      }

      // 3. Import dataset into DB
      const imp = await fetch("/api/apify", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, datasetId }),
      }).then((r) => r.json());

      showToast(
        imp.imported > 0
          ? `Done — ${imp.imported} new leads imported from Google Maps`
          : (imp.message ?? "No new leads found"),
        imp.imported > 0 ? "success" : "error",
      );
    } catch (err) {
      showToast("Apify sync failed — check console", "error");
      console.error("[Apify sync]", err);
    } finally {
      setSyncing(false);
    }
  }

  // Prevent hydration mismatch by rendering a placeholder until the client mounts
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
          </div>

          {/* Conversation drawer */}
          <ConversationDrawer />
        </div>
      </div>

      <AddLeadModal open={addLeadOpen} onClose={() => setAddLeadOpen(false)} />
      <ToastContainer />
    </div>
  );
}
