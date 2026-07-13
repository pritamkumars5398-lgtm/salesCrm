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
import "@/lib/devFetchLogger";

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
    showToast, login, syncing, syncRuns, syncPanelOpen, setSyncPanelOpen,
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

    if (useAppStore.getState().agentsLoaded) return;

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
        setAgentsLoaded(true);

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

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar onAddLead={() => setAddLeadOpen(true)} onSyncApify={handleSyncApify} syncing={syncing} />

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 min-w-0 overflow-y-auto">{children}</div>
          <ConversationDrawer />
        </div>
      </div>

      <AddLeadModal open={addLeadOpen} onClose={() => setAddLeadOpen(false)} />
      <SyncPanel
        runs={syncRuns}
        open={syncPanelOpen}
        onClose={() => setSyncPanelOpen(false)}
        onCancel={(runId) => {
          if (activeAgent) cancelSyncRun(activeAgent._id, runId);
        }}
      />
      <ToastContainer />
    </div>
  );
}
