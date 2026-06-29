"use client";
import { useState, useRef } from "react";
import {
  IconX, IconUserPlus, IconPlayerPlay, IconCloudUpload,
  IconSparkles, IconTrash, IconUserCheck, IconLoader2
} from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import type { Channel } from "@/store/types";
import * as XLSX from "xlsx";

interface Props {
  open: boolean;
  onClose: () => void;
}

const DEFAULT_FORM = {
  firstName: "", lastName: "", jobTitle: "", company: "",
  email: "", phone: "", source: "Manual",
  channels: [] as Channel[],
  website: "",
};

export default function AddLeadModal({ open, onClose }: Props) {
  const { activeAgent, addLead, addLeads, showToast } = useAppStore();
  const [importMode, setImportMode] = useState<"manual" | "ai" | "file">("manual");

  // Manual Form State
  const [form, setForm] = useState(DEFAULT_FORM);

  // AI Extractor State
  const [pastedText, setPastedText] = useState("");
  const [parsing, setParsing] = useState(false);

  // Bulk Import State (AI & File Upload)
  const [parsedLeads, setParsedLeads] = useState<any[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  // Manual input set helper
  function set(key: string, val: string) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  function toggleChannel(ch: Channel) {
    setForm((p) => ({
      ...p,
      channels: p.channels.includes(ch) ? p.channels.filter((c) => c !== ch) : [...p.channels, ch],
    }));
  }

  const hasEmail = form.email.trim().length > 0;
  const hasPhone = form.phone.trim().length > 0;
  const canSubmitManual = hasEmail || hasPhone;

  // Submit Manual Single Lead
  async function submitManual(startOutreach = false) {
    if (!activeAgent) return;
    if (!canSubmitManual) {
      showToast("At least an email or phone number is required.", "error");
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...form,
        agentId: activeAgent._id,
        status: startOutreach ? "in_outreach" : "new",
      };
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const lead = await res.json();
      addLead(lead);
      showToast(startOutreach ? "Lead added & outreach started!" : "Lead added!");
      setForm(DEFAULT_FORM);
      onClose();
    } catch {
      showToast("Failed to add lead", "error");
    } finally {
      setSaving(false);
    }
  }

  // Parse Raw Text with AI
  async function handleAIParse() {
    if (!activeAgent) return;
    if (!pastedText.trim()) {
      showToast("Please paste some text to extract leads from.", "error");
      return;
    }
    setParsing(true);
    try {
      const res = await fetch("/api/ai/parse-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pastedText, agentId: activeAgent._id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to extract leads");
      }
      if (data.length === 0) {
        showToast("AI could not extract any leads from the text.", "error");
        return;
      }
      setParsedLeads(data);
      setSelectedLeads(new Set(data.keys()));
      showToast(`AI successfully extracted ${data.length} leads!`, "success");
    } catch (err: any) {
      showToast(err.message || "Failed to parse text", "error");
    } finally {
      setParsing(false);
    }
  }

  // Parse CSV File client-side
  function parseCSV(text: string): any[] {
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map((h) => h.replace(/^["']|["']$/g, "").trim().toLowerCase());
    const results = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(",");
      const values = matches.map((v) => v.replace(/^["']|["']$/g, "").trim());

      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || "";
      });

      const firstName = row.firstname || row["first name"] || row.name?.split(" ")[0] || "Unknown";
      const lastName = row.lastname || row["last name"] || row.name?.split(" ").slice(1).join(" ") || "Unknown";
      const email = row.email || row["email address"] || "";
      const phone = row.phone || row["phone number"] || row.mobile || "";
      const jobTitle = row.jobtitle || row["job title"] || row.role || row.designation || "";
      const company = row.company || row["company name"] || row.organization || "";
      const website = row.website || row["company website"] || row.site || "";

      results.push({
        firstName,
        lastName,
        email,
        phone,
        jobTitle,
        company,
        website,
        source: "Manual",
        channels: [],
      });
    }
    return results;
  }

  // Parse XLSX File client-side
  function handleExcelUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (rows.length < 2) {
          showToast("No leads found in spreadsheet.", "error");
          return;
        }

        const headers = rows[0].map((h: any) => String(h).trim().toLowerCase());
        const results: any[] = [];

        for (let i = 1; i < rows.length; i++) {
          const rowData = rows[i];
          if (!rowData || rowData.length === 0) continue;

          const row: Record<string, string> = {};
          headers.forEach((header: string, index: number) => {
            row[header] = rowData[index] !== undefined ? String(rowData[index]).trim() : "";
          });

          const firstName = row.firstname || row["first name"] || row.name?.split(" ")[0] || "Unknown";
          const lastName = row.lastname || row["last name"] || row.name?.split(" ").slice(1).join(" ") || "Unknown";
          const email = row.email || row["email address"] || "";
          const phone = row.phone || row["phone number"] || row.mobile || "";
          const jobTitle = row.jobtitle || row["job title"] || row.role || row.designation || "";
          const company = row.company || row["company name"] || row.organization || "";
          const website = row.website || row["company website"] || row.site || "";

          results.push({
            firstName,
            lastName,
            email,
            phone,
            jobTitle,
            company,
            website,
            source: "Manual",
            channels: [],
          });
        }

        setParsedLeads(results);
        setSelectedLeads(new Set(results.keys()));
        showToast(`Parsed ${results.length} leads successfully!`, "success");
      } catch (err) {
        showToast("Error reading spreadsheet", "error");
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // Handle uploaded files (CSV or Excel)
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith(".csv")) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        const results = parseCSV(text);
        setParsedLeads(results);
        setSelectedLeads(new Set(results.keys()));
        showToast(`Parsed ${results.length} leads successfully!`, "success");
      };
      reader.readAsText(file);
    } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      handleExcelUpload(file);
    } else {
      showToast("Unsupported file type. Please upload CSV or Excel file.", "error");
    }
  }

  // Update a single parsed lead's field in the Preview Table
  function updateParsedLead(index: number, key: string, val: string) {
    setParsedLeads((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [key]: val };
      return copy;
    });
  }

  // Delete a parsed lead row from the Preview Table
  function deleteParsedLeadRow(index: number) {
    setParsedLeads((prev) => prev.filter((_, idx) => idx !== index));
    setSelectedLeads((prev) => {
      const copy = new Set(prev);
      copy.delete(index);
      // Re-map index values to align with new indexes
      const updated = new Set<number>();
      prev.forEach((val) => {
        if (val < index) updated.add(val);
        if (val > index) updated.add(val - 1);
      });
      return updated;
    });
  }

  function toggleSelectLead(index: number) {
    setSelectedLeads((prev) => {
      const copy = new Set(prev);
      if (copy.has(index)) {
        copy.delete(index);
      } else {
        copy.add(index);
      }
      return copy;
    });
  }

  // Save parsed leads in bulk
  async function submitBulk() {
    if (!activeAgent) return;
    const leadsToSave = parsedLeads
      .filter((_, idx) => selectedLeads.has(idx))
      .map((l) => ({
        ...l,
        agentId: activeAgent._id,
      }));

    if (leadsToSave.length === 0) {
      showToast("Please select at least one lead to import.", "error");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leadsToSave),
      });

      if (!res.ok) {
        throw new Error("Bulk import failed");
      }

      const inserted = await res.json();
      addLeads(inserted);
      showToast(`Imported ${inserted.length} leads successfully!`, "success");
      onClose();

      // Clear states
      setParsedLeads([]);
      setSelectedLeads(new Set());
      setPastedText("");
    } catch {
      showToast("Failed to import leads.", "error");
    } finally {
      setSaving(false);
    }
  }

  const CHANNELS: Channel[] = ["email", "whatsapp", "sms", "call"];
  const isBulkMode = importMode === "ai" || importMode === "file";
  const showPreview = isBulkMode && parsedLeads.length > 0;
  const modalWidth = showPreview ? 920 : 480;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="rounded-[14px] overflow-hidden border flex flex-col max-h-[85vh] transition-all duration-300"
        style={{
          background: "var(--color-bg2)",
          borderColor: "rgba(0,0,0,0.15)",
          width: modalWidth,
          maxWidth: "95vw",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: "rgba(0,0,0,0.1)" }}>
          <span className="text-[14px] font-semibold">Add Leads</span>
          <button
            className="inline-flex items-center justify-center p-1 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 border-none bg-transparent"
            onClick={onClose}
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex px-5 pt-3 border-b shrink-0 gap-4" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
          {(["manual", "ai", "file"] as const).map((m) => {
            const labels = { manual: "Manual Entry", ai: "AI Lead Extractor", file: "Excel / CSV Import" };
            const isActive = importMode === m;
            return (
              <button
                key={m}
                onClick={() => {
                  setImportMode(m);
                  setParsedLeads([]);
                  setSelectedLeads(new Set());
                }}
                className="pb-2 text-[12.5px] font-medium border-b-2 transition-all relative capitalize bg-transparent border-none cursor-pointer"
                style={{
                  borderColor: isActive ? "#6c63ff" : "transparent",
                  color: isActive ? "#6c63ff" : "var(--color-text3)",
                }}
              >
                {labels[m]}
              </button>
            );
          })}
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 flex-1 overflow-y-auto flex flex-col gap-4">
          
          {/* 1. Manual Mode */}
          {importMode === "manual" && (
            <div className="flex flex-col gap-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11.5px] font-medium" style={{ color: "var(--color-text2)" }}>First name</label>
                  <input className="form-input" placeholder="Rahul" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11.5px] font-medium" style={{ color: "var(--color-text2)" }}>Last name</label>
                  <input className="form-input" placeholder="Sharma" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11.5px] font-medium" style={{ color: "var(--color-text2)" }}>Job title</label>
                  <input className="form-input" placeholder="CTO" value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11.5px] font-medium" style={{ color: "var(--color-text2)" }}>Company</label>
                  <input className="form-input" placeholder="TechCorp India" value={form.company} onChange={(e) => set("company", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11.5px] font-medium" style={{ color: "var(--color-text2)" }}>Email</label>
                  <input className="form-input" type="email" placeholder="rahul@techcorp.in" value={form.email} onChange={(e) => set("email", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11.5px] font-medium" style={{ color: "var(--color-text2)" }}>Website</label>
                  <input className="form-input" placeholder="https://techcorp.in" value={form.website} onChange={(e) => set("website", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11.5px] font-medium" style={{ color: "var(--color-text2)" }}>Phone / WhatsApp</label>
                  <input className="form-input" placeholder="+91xxxxxxxxxx" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11.5px] font-medium" style={{ color: "var(--color-text2)" }}>Source</label>
                  <select className="form-input" value={form.source} onChange={(e) => set("source", e.target.value)}>
                    {["Manual","LinkedIn","Google Maps","Apify","Referral"].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11.5px] font-medium" style={{ color: "var(--color-text2)" }}>Channels</label>
                <div className="flex gap-2">
                  {CHANNELS.map((ch) => (
                    <button
                      key={ch}
                      onClick={() => toggleChannel(ch)}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors capitalize cursor-pointer"
                      style={{
                        borderColor: form.channels.includes(ch) ? "#6c63ff" : "rgba(0,0,0,0.1)",
                        background: form.channels.includes(ch) ? "rgba(108,99,255,0.12)" : "var(--color-bg3)",
                        color: form.channels.includes(ch) ? "var(--color-accent2)" : "var(--color-text2)",
                      }}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2. AI Lead Extractor Mode */}
          {importMode === "ai" && !showPreview && (
            <div className="flex flex-col gap-3">
              <label className="text-[12px] font-medium" style={{ color: "var(--color-text2)" }}>
                Paste raw lead details, email chain, or LinkedIn info here:
              </label>
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="e.g. Hi, this is Rajesh Sen, Lead Developer at CodeX (+91 9876543210, rajesh@codex.in). Also spoke with Anita Desai who is Product Head at CodeX (anita@codex.in)..."
                rows={8}
                disabled={parsing}
                className="w-full p-3 rounded-xl border text-[13px] outline-none"
                style={{
                  background: "transparent",
                  borderColor: "rgba(0,0,0,0.12)",
                  color: "var(--color-text)",
                  fontFamily: "var(--font-sans)",
                }}
              />
              <button
                onClick={handleAIParse}
                disabled={parsing || !pastedText.trim()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold bg-gradient-to-br from-indigo-600 to-indigo-500 text-white border-none cursor-pointer self-start transition-all disabled:opacity-50"
              >
                {parsing ? (
                  <>
                    <IconLoader2 size={15} className="animate-spin" />
                    Extracting leads...
                  </>
                ) : (
                  <>
                    <IconSparkles size={15} />
                    Extract with AI
                  </>
                )}
              </button>
            </div>
          )}

          {/* 3. File Upload Mode */}
          {importMode === "file" && !showPreview && (
            <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed rounded-2xl cursor-pointer hover:border-indigo-400 transition-colors"
                 style={{ borderColor: "rgba(0,0,0,0.12)" }}
                 onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".csv, .xlsx, .xls"
                className="hidden"
              />
              <IconCloudUpload size={40} className="text-slate-400 mb-2" />
              <p className="text-[13px] font-semibold text-slate-700">Click to upload spreadsheet</p>
              <p className="text-[11.5px] text-slate-400 mt-0.5">Supports CSV and Excel (.xlsx, .xls) files</p>
            </div>
          )}

          {/* 4. Preview Table for Bulk Modes */}
          {showPreview && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
                <span className="text-[12.5px] font-semibold text-slate-700">
                  Preview parsed leads ({parsedLeads.length} found, {selectedLeads.size} selected)
                </span>
                <button
                  onClick={() => {
                    setParsedLeads([]);
                    setSelectedLeads(new Set());
                  }}
                  className="text-[11.5px] text-red-500 flex items-center gap-1 font-semibold border-none bg-transparent cursor-pointer"
                >
                  <IconTrash size={13} /> Reset
                </button>
              </div>

              <div className="overflow-x-auto border rounded-xl" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                <table className="w-full text-left border-collapse text-[12px]">
                  <thead>
                    <tr className="bg-slate-50 border-b" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                      <th className="py-2.5 px-3 w-8">
                        <input
                          type="checkbox"
                          checked={selectedLeads.size === parsedLeads.length && parsedLeads.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedLeads(new Set(parsedLeads.keys()));
                            } else {
                              setSelectedLeads(new Set());
                            }
                          }}
                        />
                      </th>
                      <th className="py-2.5 px-3 font-semibold text-slate-500">Name</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-500">Contact details</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-500">Company & Job title</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-500">Source</th>
                      <th className="py-2.5 px-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedLeads.map((lead, idx) => (
                      <tr key={idx} className="border-b last:border-0 hover:bg-slate-50/50" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
                        <td className="py-2.5 px-3 align-top">
                          <input
                            type="checkbox"
                            checked={selectedLeads.has(idx)}
                            onChange={() => toggleSelectLead(idx)}
                          />
                        </td>
                        <td className="py-2.5 px-3 align-top">
                          <div className="flex flex-col gap-1 w-[150px]">
                            <input
                              className="px-2 py-1 rounded border text-[11.5px] bg-white w-full outline-none focus:border-indigo-400"
                              style={{ borderColor: "rgba(0,0,0,0.12)" }}
                              value={lead.firstName}
                              onChange={(e) => updateParsedLead(idx, "firstName", e.target.value)}
                              placeholder="First Name"
                            />
                            <input
                              className="px-2 py-1 rounded border text-[11.5px] bg-white w-full outline-none focus:border-indigo-400"
                              style={{ borderColor: "rgba(0,0,0,0.12)" }}
                              value={lead.lastName}
                              onChange={(e) => updateParsedLead(idx, "lastName", e.target.value)}
                              placeholder="Last Name"
                            />
                          </div>
                        </td>
                        <td className="py-2.5 px-3 align-top">
                          <div className="flex flex-col gap-1 w-[200px]">
                            <input
                              className="px-2 py-1 rounded border text-[11.5px] bg-white w-full outline-none focus:border-indigo-400"
                              style={{ borderColor: "rgba(0,0,0,0.12)" }}
                              value={lead.email}
                              onChange={(e) => updateParsedLead(idx, "email", e.target.value)}
                              placeholder="Email"
                            />
                            <input
                              className="px-2 py-1 rounded border text-[11.5px] bg-white w-full outline-none focus:border-indigo-400"
                              style={{ borderColor: "rgba(0,0,0,0.12)" }}
                              value={lead.phone}
                              onChange={(e) => updateParsedLead(idx, "phone", e.target.value)}
                              placeholder="Phone number"
                            />
                          </div>
                        </td>
                        <td className="py-2.5 px-3 align-top">
                          <div className="flex flex-col gap-1 w-[180px]">
                            <input
                              className="px-2 py-1 rounded border text-[11.5px] bg-white w-full outline-none focus:border-indigo-400"
                              style={{ borderColor: "rgba(0,0,0,0.12)" }}
                              value={lead.company}
                              onChange={(e) => updateParsedLead(idx, "company", e.target.value)}
                              placeholder="Company Name"
                            />
                            <input
                              className="px-2 py-1 rounded border text-[11.5px] bg-white w-full outline-none focus:border-indigo-400"
                              style={{ borderColor: "rgba(0,0,0,0.12)" }}
                              value={lead.jobTitle}
                              onChange={(e) => updateParsedLead(idx, "jobTitle", e.target.value)}
                              placeholder="Job Title"
                            />
                          </div>
                        </td>
                        <td className="py-2.5 px-3 align-top">
                          <select
                            className="px-2 py-1 rounded border text-[11.5px] bg-white w-full outline-none focus:border-indigo-400"
                            style={{ borderColor: "rgba(0,0,0,0.12)", height: 26 }}
                            value={lead.source}
                            onChange={(e) => updateParsedLead(idx, "source", e.target.value)}
                          >
                            {["Manual", "LinkedIn", "Google Maps", "Apify", "Referral"].map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 px-3 align-middle text-center">
                          <button
                            onClick={() => deleteParsedLeadRow(idx)}
                            className="p-1 rounded text-red-500 hover:bg-red-50 border-none bg-transparent cursor-pointer"
                          >
                            <IconTrash size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t shrink-0" style={{ borderColor: "rgba(0,0,0,0.1)" }}>
          
          {/* Action buttons for manual mode */}
          {importMode === "manual" && (
            <>
              {!canSubmitManual && (
                <span className="text-[11px] self-center mr-auto" style={{ color: "var(--color-text3)" }}>
                  Email or phone is required
                </span>
              )}
              <button
                className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                disabled={saving}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold bg-gradient-to-br from-indigo-600 to-indigo-500 border-none text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={!canSubmitManual || saving}
                onClick={() => submitManual(false)}
              >
                {saving ? <IconLoader2 size={14} className="animate-spin" /> : <IconUserPlus size={14} />}
                Add lead
              </button>
              <button
                className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold bg-gradient-to-br from-indigo-600 to-indigo-500 border-none text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={!canSubmitManual || saving}
                onClick={() => submitManual(true)}
              >
                {saving ? <IconLoader2 size={14} className="animate-spin" /> : <IconPlayerPlay size={14} />}
                Add &amp; start outreach
              </button>
            </>
          )}

          {/* Action buttons for bulk / preview modes */}
          {isBulkMode && (
            <>
              <button
                className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                disabled={saving}
                onClick={() => {
                  if (showPreview) {
                    setParsedLeads([]);
                    setSelectedLeads(new Set());
                  } else {
                    onClose();
                  }
                }}
              >
                {showPreview ? "Back" : "Cancel"}
              </button>
              {showPreview && (
                <button
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold bg-gradient-to-br from-indigo-600 to-indigo-500 border-none text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={selectedLeads.size === 0 || saving}
                  onClick={submitBulk}
                >
                  {saving ? (
                    <>
                      <IconLoader2 size={14} className="animate-spin" />
                      Saving leads...
                    </>
                  ) : (
                    <>
                      <IconUserCheck size={14} />
                      Save {selectedLeads.size} lead{selectedLeads.size !== 1 ? "s" : ""}
                    </>
                  )}
                </button>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
