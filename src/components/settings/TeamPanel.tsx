"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconTrash } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import {
  addMember, cancelInvite, deleteWorkspace, getOrganization, removeMember, renameOrganization,
  renameWorkspace, updateMember, type MemberAccess, type OrganizationDetail,
} from "@/lib/api/workspace.api";
import MemberAccessEditor from "./MemberAccessEditor";

const card = "flex flex-col gap-3 rounded-xl border border-bg4 bg-bg2 p-4";
const title = "text-[14px] font-semibold text-text";
const hint = "text-[12px] leading-relaxed text-text3";
const primaryBtn = "rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50";
const primaryBg = { background: "linear-gradient(135deg, #df2a2a, #f24444)" };

export default function TeamPanel() {
  const router = useRouter();
  const { activeAgent, agents, updateAgent, removeAgent, showToast } = useAppStore();
  const orgId = activeAgent?.organizationId;
  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [orgName, setOrgName] = useState("");
  const [workspaceName, setWorkspaceName] = useState(activeAgent?.name ?? "");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteAccess, setInviteAccess] = useState<MemberAccess>({ role: "member", allWorkspaces: true, workspaceIds: [] });
  const [editing, setEditing] = useState<{ userId: string; access: MemberAccess } | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      const o = await getOrganization(orgId);
      setOrg(o);
      setOrgName(o.name);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not load the team", "error");
    }
  }, [orgId, showToast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setWorkspaceName(activeAgent?.name ?? ""); }, [activeAgent?._id, activeAgent?.name]);

  if (!orgId) return <p className={hint}>This workspace hasn&apos;t been moved into an organization yet — log out and back in.</p>;
  if (!org) return <p className={hint}>Loading…</p>;

  const isOwner = org.myRole === "owner";
  const isAdmin = isOwner || org.myRole === "admin";
  const limit = org.plan.limits.workspaces;

  async function run(action: () => Promise<unknown>, success: string): Promise<boolean> {
    try {
      await action();
      showToast(success, "success");
      load();
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Something went wrong", "error");
      return false;
    }
  }

  async function saveWorkspaceName() {
    if (!activeAgent || workspaceName.trim() === activeAgent.name) return;
    await run(async () => {
      await renameWorkspace(activeAgent._id, workspaceName.trim());
      updateAgent(activeAgent._id, { name: workspaceName.trim() });
    }, "Workspace renamed");
  }

  async function removeCurrentWorkspace() {
    if (!activeAgent) return;
    const typed = window.prompt(
      `This permanently deletes "${activeAgent.name}" with all its leads, conversations, calls, schedules and settings.\n\nType the workspace name to confirm:`,
    );
    if (typed === null) return;
    try {
      await deleteWorkspace(activeAgent._id, typed);
      const next = agents.find((a) => a._id !== activeAgent._id);
      removeAgent(activeAgent._id);
      showToast("Workspace deleted", "success");
      router.replace(next ? `/dashboard/${next._id}` : "/");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not delete the workspace", "error");
    }
  }

  async function invite() {
    if (!inviteEmail.trim()) return;
    try {
      const res = await addMember(org!._id, inviteEmail.trim(), inviteAccess);
      showToast(res.added ? "Added — they can open it now." : "Invite saved — it's used when they sign up or log in with that email.", "success");
      setInviteEmail("");
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not add the member", "error");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className={card}>
        <h3 className={title}>This workspace</h3>
        <p className={hint}>Each workspace is one business line with its own leads, AI playbook, sequences and schedules.</p>
        <div className="flex flex-wrap gap-2">
          <input className="form-input min-w-[200px] flex-1" value={workspaceName} maxLength={60} disabled={!isAdmin} onChange={(e) => setWorkspaceName(e.target.value)} />
          {isAdmin && (
            <button onClick={saveWorkspaceName} disabled={!workspaceName.trim() || workspaceName.trim() === activeAgent?.name} className={primaryBtn} style={primaryBg}>Rename</button>
          )}
        </div>
        {isAdmin && (
          <button onClick={removeCurrentWorkspace} className="flex items-center gap-1.5 self-start text-[12.5px] font-semibold text-red-500">
            <IconTrash size={14} /> Delete this workspace
          </button>
        )}
      </div>

      <div className={card}>
        <h3 className={title}>Organization</h3>
        <div className="flex flex-wrap gap-2">
          <input className="form-input min-w-[200px] flex-1" value={orgName} maxLength={80} disabled={!isAdmin} onChange={(e) => setOrgName(e.target.value)} />
          {isAdmin && (
            <button onClick={() => run(() => renameOrganization(org._id, orgName.trim()), "Organization renamed")} disabled={!orgName.trim() || orgName.trim() === org.name} className={primaryBtn} style={primaryBg}>Save</button>
          )}
        </div>
        <p className={hint}>
          Plan: <b>{org.plan.name}</b> · {org.workspaces.length}{limit === -1 ? "" : ` of ${limit}`} workspaces · this month across all workspaces:
          {" "}{org.usage.leadsScraped} leads, {org.usage.emailsSent} emails, {org.usage.messagesSent} WhatsApp, {org.usage.callsMade} calls.
          Limits are shared by every workspace.
        </p>
      </div>

      <div className={card}>
        <h3 className={title}>Members</h3>
        {org.members.map((m) => {
          const editable = isAdmin && !m.isMe && m.role !== "owner" && (isOwner || m.role === "member");
          const isEditing = editing?.userId === m.userId;
          return (
            <div key={m.userId} className="flex flex-col gap-2 border-b border-bg3 pb-3 last:border-0 last:pb-0">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-text">{m.name}{m.isMe ? " (you)" : ""}</p>
                  <p className="truncate text-[11.5px] text-text3">
                    {m.email} · {m.role}
                    {m.role === "member" && !m.allWorkspaces && ` · ${m.workspaceIds.length} workspace${m.workspaceIds.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                {editable && !isEditing && (
                  <button
                    onClick={() => setEditing({ userId: m.userId, access: { role: m.role === "admin" ? "admin" : "member", allWorkspaces: m.allWorkspaces, workspaceIds: m.workspaceIds } })}
                    className="text-[12px] font-semibold text-text2 underline"
                  >
                    Change access
                  </button>
                )}
                {(editable || (m.isMe && m.role !== "owner")) && (
                  <button
                    onClick={() => window.confirm(m.isMe ? "Leave this organization?" : `Remove ${m.name} from the organization?`)
                      && run(() => removeMember(org._id, m.userId), m.isMe ? "You left the organization" : "Member removed")
                        .then((ok) => { if (ok && m.isMe) window.location.replace("/dashboard/default"); })}
                    className="text-[12px] font-semibold text-red-500"
                  >
                    {m.isMe ? "Leave" : "Remove"}
                  </button>
                )}
              </div>
              {isEditing && editing && (
                <div className="flex flex-col gap-2 pl-1">
                  <MemberAccessEditor value={editing.access} workspaces={org.workspaces} canGrantAdmin={isOwner} onChange={(access) => setEditing({ userId: m.userId, access })} />
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(null)} className="rounded-lg border border-bg4 px-3 py-1.5 text-[12.5px] font-semibold text-text2">Cancel</button>
                    <button
                      onClick={() => run(() => updateMember(org._id, m.userId, editing.access), "Access updated").then((ok) => { if (ok) setEditing(null); })}
                      className={primaryBtn}
                      style={primaryBg}
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isAdmin && (
        <div className={card}>
          <h3 className={title}>Add a team member</h3>
          <p className={hint}>
            If they already have an account they&apos;re added right away. Otherwise they join automatically when they sign up with
            this email — share the sign-up link with them (no email is sent).
          </p>
          <input className="form-input" type="email" placeholder="name@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          <MemberAccessEditor value={inviteAccess} workspaces={org.workspaces} canGrantAdmin={isOwner} onChange={setInviteAccess} />
          <button onClick={invite} disabled={!inviteEmail.trim()} className={`${primaryBtn} self-end`} style={primaryBg}>Add member</button>

          {org.invites.length > 0 && (
            <div className="flex flex-col gap-1 border-t border-bg3 pt-3">
              <p className="text-[12px] font-semibold text-text2">Waiting to sign up</p>
              {org.invites.map((i) => (
                <div key={i._id} className="flex items-center gap-2 text-[12.5px] text-text2">
                  <span className="min-w-0 flex-1 truncate">{i.email} · {i.role}</span>
                  <button onClick={() => run(() => cancelInvite(org._id, i._id), "Invite cancelled")} className="text-[12px] font-semibold text-red-500">Cancel</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
