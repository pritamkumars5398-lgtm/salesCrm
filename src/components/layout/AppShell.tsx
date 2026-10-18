"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { VALID_PAGES } from "@/lib/constants/pages";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import ConversationDrawer from "@/components/drawer/ConversationDrawer";
import ToastContainer from "@/components/ui/Toast";
import AddLeadModal from "@/components/ui/AddLeadModal";
import SyncPanel from "@/components/ui/SyncPanel";
import AssistantPanel from "@/components/assistant/AssistantPanel";
import type { Agent, OrganizationSummary } from "@/store/types";
import "@/lib/devFetchLogger";
import "@/lib/session-guard";

/**
 * The app chrome (sidebar, topbar, drawer, modals) plus the session bootstrap.
 *
 * Rendered from the ROOT layout on purpose. A layout under `/[page]/[agentId]`
 * remounts whenever the `[page]` segment changes, which is what made every
 * sidebar click re-run the bootstrap and refetch the sidebar's own data. The
 * root layout has no dynamic segments, so this subtree survives navigation and
 * only `children` swaps out.
 *
 * Routes that are not app pages (landing, login, signup) render bare.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const segment = pathname.split("/")[1] ?? "";
  const isAppRoute = (VALID_PAGES as readonly string[]).includes(segment);

  if (!isAppRoute) return <>{children}</>;
  return <Shell>{children}</Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [, pageParam, agentIdParam] = pathname.split("/");

  const router = useRouter();
  const {
    agents, activeAgent, agentsLoaded, setAgents, setAgentsLoaded, setActiveAgent,
    showToast, login, setIsSuperadmin, setOrganizations, logout, syncing, syncRuns, syncNote, syncPanelOpen, setSyncPanelOpen,
    runApifySync, cancelSyncRun, addLeadOpen, setAddLeadOpen,
  } = useAppStore();
  const [mounted, setMounted] = useState(false);

  function handleSyncApify() {
    const agentId = useAppStore.getState().activeAgent?._id;
    if (!agentId) return;
    runApifySync(agentId, { onLimitReached: () => router.push(`/plans/${agentId}`) });
  }

  // Keep the active agent in step with the URL (agent switch, deep link, back button).
  useEffect(() => {
    if (agents.length === 0 || !agentIdParam) return;
    const match = agents.find((a) => a._id === agentIdParam);
    if (match) {
      if (activeAgent?._id !== agentIdParam) setActiveAgent(match);
    } else {
      setActiveAgent(agents[0]);
      router.replace(`/${pageParam || "dashboard"}/${agents[0]._id}`);
    }
  }, [agentIdParam, agents, activeAgent?._id, pageParam, setActiveAgent, router]);

  // Session bootstrap. Runs once for the whole session, not once per navigation.
  // The server decides who is signed in and which workspaces they may open.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let me: {
        user: { name: string; email: string; isSuperadmin: boolean };
        organizations: OrganizationSummary[];
        workspaces: Agent[];
      };
      try {
        const res = await fetch("/api/auth/me");
        if (res.status === 401) {
          localStorage.removeItem("sa_user");
          router.replace("/");
          return;
        }
        if (!res.ok) throw new Error(`status ${res.status}`);
        me = await res.json();
      } catch {
        showToast("Could not connect to the server", "error");
        return;
      }
      if (cancelled) return;

      login(me.user.name, me.user.email);
      setIsSuperadmin(me.user.isSuperadmin);
      setOrganizations(me.organizations);

      let workspaces = me.workspaces;
      const canCreate = me.organizations.some((o) => o.role !== "member");
      if (workspaces.length === 0 && canCreate) {
        // First visit after signup: create the first workspace from what the signup form collected.
        let onboarding: Record<string, string> = {};
        try {
          onboarding = JSON.parse(localStorage.getItem("sa_onboarding") || "{}");
        } catch (e) {
          console.error("[onboarding parse error]", e);
        }
        const res = await fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: onboarding.businessName || `${me.user.name.split(" ")[0]}'s business`,
            templateId: "blank",
            onlyIfNone: true,
            settings: {
              brandName: onboarding.businessName || "",
              businessWebsite: onboarding.businessWebsite || "",
              businessPhone: onboarding.businessPhone || "",
              businessServices: onboarding.businessServices || "",
              docLink: onboarding.docLink || "",
              customPrompt: onboarding.customPrompt || "",
              followUpDays: onboarding.followUpDays || "3",
            },
          }),
        });
        if (res.ok) {
          workspaces = [await res.json()];
        } else if (res.status === 409) {
          // A workspace exists but wasn't listed (e.g. migrated just now) — ask again.
          const again = await fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).catch(() => null);
          workspaces = again?.workspaces ?? [];
        } else {
          showToast((await res.json().catch(() => ({}))).error || "Could not create your workspace", "error");
        }
      }
      localStorage.removeItem("sa_onboarding");
      if (cancelled) return;

      setAgents(workspaces);
      setAgentsLoaded(true);
      setMounted(true);

      const match = workspaces.find((a) => a._id === agentIdParam);
      if (match) {
        setActiveAgent(match);
      } else if (workspaces.length > 0) {
        setActiveAgent(workspaces[0]);
        router.replace(`/${pageParam || "dashboard"}/${workspaces[0]._id}`);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!mounted) {
    return (
      <div
        style={{
          display: "flex",
          height: "100vh",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-bg)",
          color: "var(--color-text)",
          fontFamily: "var(--font-sans)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div className="live-dot" style={{ transform: "scale(1.5)" }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text3)", letterSpacing: "0.02em" }}>
            Loading SalesAgent...
          </div>
        </div>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-bg px-4 text-center">
        <p className="text-[15px] font-semibold text-text">You don&apos;t have access to a workspace yet</p>
        <p className="max-w-sm text-[13px] text-text3">
          Ask an admin of your organization to give you access to a workspace, then reload this page.
        </p>
        <button
          onClick={() => { logout(); router.replace("/"); }}
          className="mt-2 rounded-lg border border-bg4 bg-bg2 px-4 py-2 text-[13px] font-semibold text-text2"
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar onAddLead={() => setAddLeadOpen(true)} onSyncApify={handleSyncApify} syncing={syncing} />

        <div className="flex flex-1 overflow-hidden">
          <div key={pathname} className="flex-1 min-w-0 overflow-y-auto animate-fade-in">
            {children}
          </div>
          <ConversationDrawer />
        </div>
      </div>

      <AddLeadModal open={addLeadOpen} onClose={() => setAddLeadOpen(false)} />
      <SyncPanel
        runs={syncRuns}
        syncing={syncing}
        note={syncNote}
        open={syncPanelOpen}
        onClose={() => setSyncPanelOpen(false)}
        onCancel={(runId) => {
          if (activeAgent) cancelSyncRun(activeAgent._id, runId);
        }}
      />
      <AssistantPanel />
      <ToastContainer />
    </div>
  );
}
