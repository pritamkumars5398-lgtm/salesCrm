"use client";
import type { MemberAccess } from "@/lib/api/workspace.api";

interface Props {
  value: MemberAccess;
  workspaces: { _id: string; name: string }[];
  /** only the owner can grant admin */
  canGrantAdmin: boolean;
  onChange: (value: MemberAccess) => void;
}

/** Role + which workspaces a member may open. Admins always see every workspace. */
export default function MemberAccessEditor({ value, workspaces, canGrantAdmin, onChange }: Props) {
  function toggleWorkspace(id: string) {
    const ids = value.workspaceIds.includes(id) ? value.workspaceIds.filter((w) => w !== id) : [...value.workspaceIds, id];
    onChange({ ...value, workspaceIds: ids });
  }

  return (
    <div className="flex flex-col gap-2">
      <select
        className="form-input w-auto"
        value={value.role}
        onChange={(e) => onChange({ ...value, role: e.target.value as MemberAccess["role"], allWorkspaces: e.target.value === "admin" ? true : value.allWorkspaces })}
      >
        <option value="member">Member — works leads, can&apos;t change settings</option>
        {(canGrantAdmin || value.role === "admin") && <option value="admin">Admin — full access except billing &amp; owner</option>}
      </select>
      {value.role === "member" && (
        <div className="flex flex-col gap-1 rounded-lg border border-bg4 p-2">
          <label className="flex items-center gap-2 text-[12.5px] text-text2">
            <input type="checkbox" checked={value.allWorkspaces} onChange={(e) => onChange({ ...value, allWorkspaces: e.target.checked })} />
            All workspaces (including new ones)
          </label>
          {!value.allWorkspaces && workspaces.map((w) => (
            <label key={w._id} className="ml-5 flex items-center gap-2 text-[12.5px] text-text2">
              <input type="checkbox" checked={value.workspaceIds.includes(w._id)} onChange={() => toggleWorkspace(w._id)} />
              {w.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
