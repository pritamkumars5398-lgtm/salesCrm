"use client";

import React, { useState, useEffect } from "react";
import {
  IconFilter, IconCheck, IconSparkles, IconAlertCircle,
  IconChevronDown, IconChevronUp, IconBuildingSkyscraper,
} from "@tabler/icons-react";
import {
  LEAD_FILTER_KEY,
  DEFAULT_LEAD_FILTER,
  LEAD_FILTER_PRESETS,
  parseLeadFilter,
  describeLeadFilter,
  type LeadFilter,
} from "@/lib/lead-filter";
import SettingsToggle from "./SettingsToggle";

interface Props {
  agentId: string;
  filterString?: string;
  industry?: string;
  businessName?: string;
  onSaved?: (filter: LeadFilter) => void;
  showToast?: (msg: string, type?: "success" | "error") => void;
}

export default function LeadFilterPanel({
  agentId,
  filterString,
  industry,
  businessName,
  onSaved,
  showToast,
}: Props) {
  const [filter, setFilter] = useState<LeadFilter>(() => parseLeadFilter(filterString));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // Initialize or re-sync when filterString prop changes
  useEffect(() => {
    if (filterString) {
      setFilter(parseLeadFilter(filterString));
    } else {
      // Auto-suggest preset based on workspace industry or name
      const ind = (industry || "").toLowerCase();
      const bname = (businessName || "").toLowerCase();
      if (ind.includes("hotel") || ind.includes("resort") || bname.includes("hotel") || bname.includes("restur")) {
        const p = LEAD_FILTER_PRESETS.find((x) => x.id === "hotels");
        if (p) {
          setFilter(p.filter);
          setActivePreset("hotels");
        }
      } else if (ind.includes("dent") || ind.includes("clinic") || ind.includes("health")) {
        const p = LEAD_FILTER_PRESETS.find((x) => x.id === "clinics");
        if (p) {
          setFilter(p.filter);
          setActivePreset("clinics");
        }
      } else if (ind.includes("school") || ind.includes("edu")) {
        const p = LEAD_FILTER_PRESETS.find((x) => x.id === "schools");
        if (p) {
          setFilter(p.filter);
          setActivePreset("schools");
        }
      }
    }
  }, [filterString, industry, businessName]);

  function applyPreset(presetId: string) {
    const p = LEAD_FILTER_PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    setFilter(p.filter);
    setActivePreset(presetId);
    if (showToast) showToast(`Applied "${p.label}" filter preset`);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          settings: {
            [LEAD_FILTER_KEY]: JSON.stringify(filter),
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to save filter settings");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved?.(filter);
      if (showToast) showToast("Ideal customer filter saved successfully", "success");
    } catch (err: any) {
      if (showToast) showToast(err.message || "Failed to save filter", "error");
    } finally {
      setSaving(false);
    }
  }

  const summary = describeLeadFilter(filter);

  return (
    <div
      style={{
        background: "var(--color-bg2)",
        border: "1px solid var(--color-bg4)",
        borderRadius: 14,
        padding: "18px 20px",
        marginBottom: 24,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: "rgba(16,185,129,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#10b981",
            }}
          >
            <IconFilter size={18} />
          </span>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text)", margin: 0 }}>
                Ideal Customer Filter (Brand Exclusions & Quality)
              </h3>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: 99,
                  background: filter.enabled ? "rgba(16,185,129,0.15)" : "var(--color-bg3)",
                  color: filter.enabled ? "#10b981" : "var(--color-text3)",
                }}
              >
                {filter.enabled ? "Active" : "Off"}
              </span>
            </div>
            <p style={{ fontSize: 11.5, color: "var(--color-text3)", margin: "2px 0 0" }}>
              Filter out famous chains (e.g. Taj Hotel, Vivanta, Marriott, OYO) and closed places so you only get real independent buyers.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SettingsToggle
            checked={filter.enabled}
            onChange={(enabled) => setFilter((prev) => ({ ...prev, enabled }))}
          />
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-text3)",
              cursor: "pointer",
              padding: 4,
              display: "flex",
              alignItems: "center",
            }}
            title={expanded ? "Collapse filter details" : "Expand filter details"}
          >
            {expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Summary Banner */}
      <div
        style={{
          background: "var(--color-bg)",
          border: "1px solid var(--color-bg4)",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12,
          color: "var(--color-text2)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: expanded ? 16 : 0,
        }}
      >
        <span style={{ fontWeight: 600, color: "var(--color-text)" }}>Filter rules:</span>
        <span style={{ color: "var(--color-text3)" }}>{summary}</span>
      </div>

      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Presets */}
          <div>
            <label style={{ fontSize: 11.5, fontWeight: 700, color: "var(--color-text2)", display: "block", marginBottom: 6 }}>
              Quick Presets
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {LEAD_FILTER_PRESETS.map((p) => {
                const isSelected = activePreset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: isSelected ? "1px solid #10b981" : "1px solid var(--color-bg4)",
                      background: isSelected ? "rgba(16,185,129,0.12)" : "var(--color-bg)",
                      color: isSelected ? "#10b981" : "var(--color-text)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      transition: "all 0.15s",
                    }}
                  >
                    {p.id === "hotels" && "🏨"}
                    {p.id === "schools" && "🏫"}
                    {p.id === "clinics" && "🏥"}
                    {p.id === "any" && "⚙️"}
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Exclude Brands Textarea */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-text2)" }}>
                Excluded Brands & Domains ({filter.excludeBrands.length} listed)
              </label>
              <span style={{ fontSize: 10.5, color: "var(--color-text4)" }}>
                Comma or newline separated
              </span>
            </div>
            <textarea
              rows={4}
              value={filter.excludeBrands.join(", ")}
              onChange={(e) => {
                const brands = e.target.value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
                setFilter((prev) => ({ ...prev, excludeBrands: brands }));
                setActivePreset(null);
              }}
              placeholder="e.g. Taj, Vivanta, Oberoi, ITC, Marriott, Hyatt, Radisson, Clarks, OYO, FabHotel, marriott.com, tajhotels.com"
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--color-bg4)",
                background: "var(--color-bg)",
                color: "var(--color-text)",
                fontSize: 12,
                outline: "none",
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
            <p style={{ fontSize: 11, color: "var(--color-text4)", margin: "4px 0 0" }}>
              Places matching these brand names or website domains are dropped and <strong>will not consume your lead quota</strong>.
            </p>
          </div>

          {/* Category Filters */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-text2)", display: "block", marginBottom: 5 }}>
                Include Categories (Leave empty for all)
              </label>
              <input
                type="text"
                value={filter.includeCategories.join(", ")}
                onChange={(e) => {
                  const cats = e.target.value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
                  setFilter((prev) => ({ ...prev, includeCategories: cats }));
                  setActivePreset(null);
                }}
                placeholder="hotel, guest house, lodge, resort, homestay"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--color-bg4)",
                  background: "var(--color-bg)",
                  color: "var(--color-text)",
                  fontSize: 12,
                  outline: "none",
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-text2)", display: "block", marginBottom: 5 }}>
                Exclude Categories (Skip non-ideal)
              </label>
              <input
                type="text"
                value={filter.excludeCategories.join(", ")}
                onChange={(e) => {
                  const cats = e.target.value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
                  setFilter((prev) => ({ ...prev, excludeCategories: cats }));
                  setActivePreset(null);
                }}
                placeholder="restaurant, dhaba, banquet, cafe, bar, travel agency"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--color-bg4)",
                  background: "var(--color-bg)",
                  color: "var(--color-text)",
                  fontSize: 12,
                  outline: "none",
                }}
              />
            </div>
          </div>

          {/* Numerical & Star Rules */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-text2)", display: "block", marginBottom: 4 }}>
                Min Reviews
              </label>
              <input
                type="number"
                min={0}
                value={filter.minReviews ?? ""}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : null;
                  setFilter((prev) => ({ ...prev, minReviews: v }));
                }}
                placeholder="10"
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--color-bg4)",
                  background: "var(--color-bg)",
                  color: "var(--color-text)",
                  fontSize: 12,
                  outline: "none",
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-text2)", display: "block", marginBottom: 4 }}>
                Max Reviews
              </label>
              <input
                type="number"
                min={0}
                value={filter.maxReviews ?? ""}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : null;
                  setFilter((prev) => ({ ...prev, maxReviews: v }));
                }}
                placeholder="2000"
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--color-bg4)",
                  background: "var(--color-bg)",
                  color: "var(--color-text)",
                  fontSize: 12,
                  outline: "none",
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-text2)", display: "block", marginBottom: 4 }}>
                Max Hotel Stars
              </label>
              <select
                value={filter.maxHotelStars ?? ""}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : null;
                  setFilter((prev) => ({ ...prev, maxHotelStars: v }));
                }}
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--color-bg4)",
                  background: "var(--color-bg)",
                  color: "var(--color-text)",
                  fontSize: 12,
                  outline: "none",
                }}
              >
                <option value="">Any star class</option>
                <option value="3">Up to 3★ (Budget / Guest Houses)</option>
                <option value="4">Up to 4★ (Skip 5★ Luxury Chains)</option>
                <option value="5">All 5★ included</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-text2)", display: "block", marginBottom: 4 }}>
                Website Filter
              </label>
              <select
                value={filter.website}
                onChange={(e) => setFilter((prev) => ({ ...prev, website: e.target.value as any }))}
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--color-bg4)",
                  background: "var(--color-bg)",
                  color: "var(--color-text)",
                  fontSize: 12,
                  outline: "none",
                }}
              >
                <option value="any">Any website status</option>
                <option value="with">Must have website</option>
                <option value="without">Without website (High Need)</option>
              </select>
            </div>
          </div>

          {/* Closed places toggle & Save button */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid var(--color-bg4)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--color-text2)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={filter.skipClosed}
                onChange={(e) => setFilter((prev) => ({ ...prev, skipClosed: e.target.checked }))}
                style={{ accentColor: "#10b981" }}
              />
              Skip permanently or temporarily closed places
            </label>

            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                background: saved ? "rgba(16,185,129,0.15)" : "linear-gradient(135deg,#10b981,#059669)",
                border: saved ? "1px solid rgba(16,185,129,0.3)" : "none",
                color: saved ? "#10b981" : "#fff",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: saving ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.2s",
              }}
            >
              {saved ? (
                <>
                  <IconCheck size={14} /> Saved Filter
                </>
              ) : (
                "Save Ideal Filter"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
