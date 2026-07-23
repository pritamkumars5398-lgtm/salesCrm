"use client";

import { useEffect, use } from "react";
import { useAppStore } from "@/store/useAppStore";
import type { Page } from "@/store/types";
import { VALID_PAGES } from "@/lib/constants/pages";

import Dashboard from "@/components/pages/Dashboard";
import Leads from "@/components/pages/Leads";
import Sequence from "@/components/pages/Sequence";
import CRM from "@/components/pages/CRM";
import Calendar from "@/components/pages/Calendar";
import Activity from "@/components/pages/Activity";
import Settings from "@/components/pages/Settings";
import Crons from "@/components/pages/Crons";
import Plans from "@/components/pages/Plans";
import Profile from "@/components/pages/Profile";
import Superadmin from "@/components/pages/Superadmin";
import VoiceTest from "@/components/pages/VoiceTest";
import Inbox from "@/components/pages/Inbox";
import VoiceInboxComingSoon from "@/components/pages/VoiceInboxComingSoon";

interface PageProps {
  params: Promise<{ page: string; agentId: string }>;
}

/**
 * Page body only — the shell (sidebar, topbar, auth bootstrap) lives in the
 * sibling layout and stays mounted across navigation.
 */
export default function Home({ params }: PageProps) {
  const { page: pageParam } = use(params);

  const setPage = useAppStore((s) => s.setPage);
  const currentPage = useAppStore((s) => s.currentPage);
  const userEmail = useAppStore((s) => s.userEmail);
  const setAddLeadOpen = useAppStore((s) => s.setAddLeadOpen);

  // Mirror the route into the store — Sidebar highlights off `currentPage`.
  useEffect(() => {
    if (pageParam && currentPage !== pageParam && (VALID_PAGES as string[]).includes(pageParam)) {
      setPage(pageParam as Page);
    }
  }, [pageParam, currentPage, setPage]);

  switch (pageParam) {
    case "dashboard":
      return <Dashboard />;
    case "leads":
      return <Leads onAddLead={() => setAddLeadOpen(true)} />;
    case "sequence":
      return <Sequence />;
    case "crm":
      return <CRM />;
    case "calendar":
      return <Calendar />;
    case "activity":
      return <Activity />;
    case "settings":
      return <Settings />;
    case "crons":
      return <Crons />;
    case "profile":
      return <Profile />;
    case "plans":
      return <Plans />;
    case "voice":
      return <VoiceTest />;
    case "inbox":
      return <Inbox />;
    case "voice-inbox":
      return <VoiceInboxComingSoon />;
    case "superadmin":
      return userEmail?.toLowerCase() === "admin@salesagent.ai" ? (
        <Superadmin />
      ) : (
        <div style={{ padding: 40, fontFamily: "var(--font-sans)", color: "var(--color-text)" }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "#ef4444", marginBottom: 6 }}>Access Denied</h3>
          <p style={{ fontSize: 13, color: "var(--color-text3)" }}>
            You do not have permissions to view the superadmin dashboard.
          </p>
        </div>
      );
    default:
      return null;
  }
}
