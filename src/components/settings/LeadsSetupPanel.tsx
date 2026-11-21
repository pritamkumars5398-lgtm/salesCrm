"use client";
import { useState } from "react";
import LeadFieldsPanel from "@/components/settings/LeadFieldsPanel";
import LeadGroupsPanel from "@/components/settings/LeadGroupsPanel";

/** The customer's "Leads" page: what you track about each lead, and how you group them. */
export default function LeadsSetupPanel({ readOnly = false, initialTab = "fields" }: { readOnly?: boolean; initialTab?: "fields" | "groups" }) {
  const [tab, setTab] = useState<"fields" | "groups">(initialTab);
  const tabs = [
    { key: "fields" as const, label: "Fields & pipeline", hint: "What you note about each lead, and your sales stages" },
    { key: "groups" as const, label: "Groups", hint: "Lists of leads, e.g. “Hot hotels in Goa”" },
  ];
  return (
    <div className="flex flex-col gap-5 w-full max-w-[900px] mx-auto">
      <div>
        <h2 className="text-[20px] font-bold text-text m-0">Leads</h2>
        <p className="text-[13px] text-text3 m-0 mt-1">Decide what you track about each lead and how you group them.</p>
      </div>
      <div className="flex gap-1 p-1 rounded-xl bg-bg2 border border-bg4 self-start">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            title={t.hint}
            onClick={() => setTab(t.key)}
            className="px-4 py-1.5 rounded-lg text-[13px] font-semibold border-none cursor-pointer"
            style={{ background: tab === t.key ? "var(--color-bg4)" : "transparent", color: tab === t.key ? "var(--color-text)" : "var(--color-text3)" }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-[12.5px] text-text3 m-0 -mt-2">{tabs.find((t) => t.key === tab)!.hint}</p>
      {tab === "fields" ? <LeadFieldsPanel readOnly={readOnly} /> : <LeadGroupsPanel readOnly={readOnly} />}
    </div>
  );
}
