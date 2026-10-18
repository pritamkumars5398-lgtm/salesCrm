"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconAlertTriangle, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import type { LeadFieldDef } from "@/lib/lead-fields";
import {
  createLeadGroup, deleteLeadGroup, listLeadFields, listLeadGroups, updateLeadGroup,
  type LeadGroup, type LeadGroupInput,
} from "@/lib/api/workspace.api";
import GroupEditor from "./GroupEditor";

interface Props {
  readOnly: boolean;
}

export default function LeadGroupsPanel({ readOnly }: Props) {
  const router = useRouter();
  const { activeAgent, showToast } = useAppStore();
  const agentId = activeAgent?._id;
  const [groups, setGroups] = useState<LeadGroup[]>([]);
  const [fields, setFields] = useState<LeadFieldDef[]>([]);
  const [editing, setEditing] = useState<LeadGroup | "new" | null>(null);

  const load = useCallback(async () => {
    if (!agentId) return;
    try {
      const [g, f] = await Promise.all([listLeadGroups(agentId), listLeadFields(agentId)]);
      setGroups(g);
      setFields(f);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not load groups", "error");
    }
  }, [agentId, showToast]);

  useEffect(() => { load(); }, [load]);

  async function save(input: LeadGroupInput) {
    if (!agentId) return;
    try {
      if (editing === "new") await createLeadGroup(agentId, input);
      else if (editing) await updateLeadGroup(editing._id, input);
      setEditing(null);
      showToast("Group saved", "success");
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not save the group", "error");
    }
  }

  async function remove(group: LeadGroup) {
    if (!window.confirm(`Delete the group "${group.name}"? The leads stay — they're only taken out of the group.`)) return;
    try {
      await deleteLeadGroup(group._id);
      showToast("Group deleted", "success");
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not delete the group", "error");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-[14px] font-semibold text-text">Lead groups</h3>
        <p className="text-[12px] leading-relaxed text-text3">
          Smart groups fill themselves from rules and stay up to date as leads change. Use a group to filter the Leads page,
          run outreach on just that group, and give the AI extra guidance for those leads.
        </p>
      </div>

      {groups.length === 0 && editing === null && <p className="text-[12px] text-text3">No groups yet.</p>}

      {groups.map((g) => (editing !== "new" && editing?._id === g._id ? (
        <GroupEditor key={g._id} fields={fields} initial={g} onCancel={() => setEditing(null)} onSave={save} />
      ) : (
        <div key={g._id} className="flex items-center gap-3 rounded-xl border border-bg4 bg-bg2 px-3 py-2.5">
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: g.color, flexShrink: 0 }} />
          <button
            onClick={() => activeAgent && router.push(`/leads/${activeAgent._id}?groupId=${g._id}`)}
            className="min-w-0 flex-1 text-left"
            title="Show these leads"
          >
            <p className="truncate text-[13px] font-semibold text-text">{g.name}</p>
            <p className="truncate text-[11.5px] text-text3">
              {g.kind === "smart" ? `Smart · ${g.rules.length} rule${g.rules.length === 1 ? "" : "s"}` : "Manual"} · {g.memberCount} lead{g.memberCount === 1 ? "" : "s"}
              {g.playbook ? " · has AI guidance" : ""}
            </p>
            {g.problems.length > 0 && (
              <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-red-500">
                <IconAlertTriangle size={12} /> {g.problems[0]} — this group matches no leads until fixed.
              </p>
            )}
          </button>
          {!readOnly && (
            <>
              <button onClick={() => setEditing(g)} aria-label={`Edit ${g.name}`} className="text-text3"><IconPencil size={15} /></button>
              <button onClick={() => remove(g)} aria-label={`Delete ${g.name}`} className="text-text3 hover:text-red-500"><IconTrash size={15} /></button>
            </>
          )}
        </div>
      )))}

      {editing === "new" ? (
        <GroupEditor fields={fields} initial={null} onCancel={() => setEditing(null)} onSave={save} />
      ) : !readOnly && (
        <button onClick={() => setEditing("new")} className="flex items-center gap-1.5 self-start rounded-lg border border-dashed border-bg4 px-3 py-2 text-[12.5px] font-semibold text-text2">
          <IconPlus size={14} /> New group
        </button>
      )}
    </div>
  );
}
