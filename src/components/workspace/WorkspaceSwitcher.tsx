"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IconCheck, IconChevronDown, IconPlus, IconSettings } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import CreateWorkspaceModal from "./CreateWorkspaceModal";
import type { Agent } from "@/store/types";

interface Props {
  collapsed: boolean;
  onNavigate: (path: string) => void;
}

/** Sidebar header: shows the current workspace and switches between business lines. */
export default function WorkspaceSwitcher({ collapsed, onNavigate }: Props) {
  const router = useRouter();
  const { agents, activeAgent, organizations, currentPage, setActiveAgent } = useAppStore();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const canCreate = organizations.some((o) => o.role !== "member");

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function switchTo(agent: Agent) {
    setOpen(false);
    if (agent._id === activeAgent?._id) return;
    setActiveAgent(agent);
    const page = currentPage === "superadmin" ? "dashboard" : currentPage;
    onNavigate(`/${page}/${agent._id}`);
  }

  // Group workspaces under their organization when the user is in more than one.
  const orgNames = [...new Set(agents.map((a) => a.organizationName || ""))];
  const showOrgHeaders = orgNames.length > 1;

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 0, flex: 1 }}>
      <button
        onClick={() => {
          const rect = ref.current?.getBoundingClientRect();
          if (rect) setMenuPos({ top: rect.bottom + 10, left: rect.left });
          setOpen((v) => !v);
        }}
        title={activeAgent?.name}
        style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
      >
        <span
          style={{
            width: 28, height: 28, borderRadius: "var(--radius-md)", flexShrink: 0,
            background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-light))",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 13, fontWeight: 800, boxShadow: "0 2px 8px rgba(79,70,229,0.3)",
          }}
        >
          {(activeAgent?.name || "S").charAt(0).toUpperCase()}
        </span>
        {!collapsed && (
          <>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--color-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.2 }}>
                {activeAgent?.name || "Workspace"}
              </span>
              <span style={{ display: "block", fontSize: 10, color: "var(--color-text4)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {activeAgent?.organizationName || "AI Sales Agent"}
              </span>
            </span>
            <IconChevronDown size={13} style={{ color: "var(--color-text3)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
          </>
        )}
      </button>

      {/* Portal: the sidebar clips overflow, which would cut this menu off. */}
      {open && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 1000,
            width: 248, maxHeight: "60vh", overflowY: "auto",
            background: "var(--color-bg2)", border: "1px solid var(--color-bg4)", borderRadius: "var(--radius-xl)",
            boxShadow: "var(--shadow-xl)", padding: 6,
          }}
        >
          <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text4)", margin: "6px 8px 4px" }}>
            Workspaces
          </p>
          {orgNames.map((orgName) => (
            <div key={orgName}>
              {showOrgHeaders && (
                <p style={{ fontSize: 10.5, fontWeight: 600, color: "var(--color-text3)", margin: "8px 8px 2px" }}>{orgName}</p>
              )}
              {agents.filter((a) => (a.organizationName || "") === orgName).map((a) => (
                <button
                  key={a._id}
                  onClick={() => switchTo(a)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 8px", border: "none",
                    borderRadius: "var(--radius-md)", cursor: "pointer", textAlign: "left",
                    background: a._id === activeAgent?._id ? "var(--color-bg3)" : "transparent",
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: a.status === "active" ? "var(--color-green)" : "var(--color-text4)" }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: "var(--color-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {a.name}
                  </span>
                  {a._id === activeAgent?._id && <IconCheck size={13} style={{ color: "var(--color-primary)" }} />}
                </button>
              ))}
            </div>
          ))}
          <div style={{ height: 1, background: "var(--color-bg3)", margin: "6px 0" }} />
          {canCreate && (
            <button
              onClick={() => { setOpen(false); setCreating(true); }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 8px", border: "none", borderRadius: "var(--radius-md)", cursor: "pointer", background: "transparent", fontSize: 12.5, fontWeight: 600, color: "var(--color-text2)" }}
            >
              <IconPlus size={14} /> New workspace
            </button>
          )}
          {activeAgent && (
            <button
              onClick={() => { setOpen(false); router.push(`/settings/${activeAgent._id}?tab=team`); }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 8px", border: "none", borderRadius: "var(--radius-md)", cursor: "pointer", background: "transparent", fontSize: 12.5, fontWeight: 600, color: "var(--color-text2)" }}
            >
              <IconSettings size={14} /> Team & workspaces
            </button>
          )}
        </div>,
        document.body,
      )}

      {creating && <CreateWorkspaceModal onClose={() => setCreating(false)} />}
    </div>
  );
}
