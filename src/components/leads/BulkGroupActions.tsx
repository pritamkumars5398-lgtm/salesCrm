"use client";
import { useEffect, useRef, useState } from "react";
import { IconTag, IconUsersGroup } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import { bulkUpdateLeads, type LeadGroup } from "@/lib/api/workspace.api";

interface Props {
  agentId: string;
  selectedIds: string[];
  groups: LeadGroup[];
  onDone: () => void;
}

const btn = "inline-flex items-center justify-center gap-1.5 !px-3 !py-[7px] !text-xs !rounded-lg font-semibold border border-bg4 bg-bg2 text-text2 hover:bg-bg3 whitespace-nowrap";

/** "Add to group" / "Tag" for the selected leads (manual groups only — smart ones fill themselves). */
export default function BulkGroupActions({ agentId, selectedIds, groups, onDone }: Props) {
  const showToast = useAppStore((s) => s.showToast);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const manual = groups.filter((g) => g.kind === "manual");

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  async function apply(change: Parameters<typeof bulkUpdateLeads>[2], message: string) {
    setOpen(false);
    try {
      await bulkUpdateLeads(agentId, selectedIds, change);
      showToast(message, "success");
      onDone();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not update the leads", "error");
    }
  }

  function addTag() {
    const tag = window.prompt(`Tag ${selectedIds.length} lead${selectedIds.length === 1 ? "" : "s"} with:`, "");
    if (tag?.trim()) apply({ addTags: [tag.trim()] }, `Tagged "${tag.trim()}"`);
  }

  return (
    <>
      <div ref={ref} style={{ position: "relative" }}>
        <button className={btn} onClick={() => setOpen((v) => !v)}>
          <IconUsersGroup size={13} /> Group
        </button>
        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-xl border border-bg4 bg-bg2 p-1.5 shadow-xl">
            {manual.length === 0 ? (
              <p className="px-2 py-1.5 text-[12px] text-text3">No manual groups yet — create one in Settings → Lead groups.</p>
            ) : (
              <>
                <p className="px-2 pb-1 pt-0.5 text-[10.5px] font-bold uppercase tracking-wider text-text4">Add to</p>
                {manual.map((g) => (
                  <button key={g._id} onClick={() => apply({ addGroupIds: [g._id] }, `Added to ${g.name}`)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-text hover:bg-bg3">
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: g.color }} /> {g.name}
                  </button>
                ))}
                <p className="px-2 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-text4">Remove from</p>
                {manual.map((g) => (
                  <button key={`rm-${g._id}`} onClick={() => apply({ removeGroupIds: [g._id] }, `Removed from ${g.name}`)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-text2 hover:bg-bg3">
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: g.color, opacity: 0.5 }} /> {g.name}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>
      <button className={btn} onClick={addTag}>
        <IconTag size={13} /> Tag
      </button>
    </>
  );
}
