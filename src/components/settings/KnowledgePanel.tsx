"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconPencil, IconTrash, IconUpload } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import {
  createKnowledge, deleteKnowledge, listKnowledge, updateKnowledge, uploadKnowledgeFile, type KnowledgeDoc,
} from "@/lib/api/workspace.api";

interface Props {
  readOnly: boolean;
}

const MAX_CHARS = 20000;

export default function KnowledgePanel({ readOnly }: Props) {
  const { activeAgent, showToast } = useAppStore();
  const agentId = activeAgent?._id;
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!agentId) return;
    try {
      setDocs(await listKnowledge(agentId));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not load the knowledge base", "error");
    }
  }, [agentId, showToast]);

  useEffect(() => { load(); }, [load]);

  function startEdit(doc: KnowledgeDoc | null) {
    setEditingId(doc?._id ?? "new");
    setTitle(doc?.title ?? "");
    setContent(doc?.content ?? "");
  }

  async function save() {
    if (!agentId) return;
    setBusy(true);
    try {
      if (editingId === "new") await createKnowledge(agentId, title, content);
      else if (editingId) await updateKnowledge(editingId, { title, content });
      setEditingId(null);
      showToast("Saved — the AI will use this from now on", "success");
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not save", "error");
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!agentId || !file) return;
    setBusy(true);
    try {
      await uploadKnowledgeFile(agentId, file);
      showToast(`"${file.name}" added`, "success");
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(doc: KnowledgeDoc) {
    if (!window.confirm(`Delete "${doc.title}"?`)) return;
    try {
      await deleteKnowledge(doc._id);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not delete", "error");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-[14px] font-semibold text-text">Knowledge base</h3>
        <p className="text-[12px] leading-relaxed text-text3">
          Product details, pricing, FAQs and policies for this business. When a lead asks a question, the AI looks up the
          matching passages here and answers from them — and says the team will confirm when the answer isn&apos;t here,
          instead of guessing. Upload .txt/.md/.csv files, or paste text (for PDFs and Word files, copy their text in).
        </p>
      </div>

      {docs.length === 0 && editingId === null && <p className="text-[12px] text-text3">Nothing here yet.</p>}

      {docs.map((d) => (editingId === d._id ? null : (
        <div key={d._id} className="flex items-start gap-3 rounded-xl border border-bg4 bg-bg2 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-text">{d.title}</p>
            <p className="line-clamp-2 text-[11.5px] text-text3">{d.content.slice(0, 220)}</p>
            <p className="mt-0.5 text-[10.5px] text-text4">{d.content.length.toLocaleString()} characters</p>
          </div>
          {!readOnly && (
            <>
              <button onClick={() => startEdit(d)} aria-label={`Edit ${d.title}`} className="text-text3"><IconPencil size={15} /></button>
              <button onClick={() => remove(d)} aria-label={`Delete ${d.title}`} className="text-text3 hover:text-red-500"><IconTrash size={15} /></button>
            </>
          )}
        </div>
      )))}

      {editingId !== null && (
        <div className="flex flex-col gap-2 rounded-xl border border-bg4 bg-bg2 p-3">
          <input className="form-input" placeholder="Title, e.g. Pricing & plans" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            className="form-input"
            rows={10}
            placeholder={"Q: Does it work with Booking.com?\nA: Yes — rooms and rates sync both ways every 5 minutes.\n\nQ: How long does setup take?\nA: ..."}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <span className={`text-[11px] ${content.length > MAX_CHARS ? "text-red-500" : "text-text3"}`}>
              {content.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setEditingId(null)} className="rounded-lg border border-bg4 px-4 py-2 text-[13px] font-semibold text-text2">Cancel</button>
              <button
                onClick={save}
                disabled={busy || !title.trim() || !content.trim() || content.length > MAX_CHARS}
                className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #df2a2a, #f24444)" }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {!readOnly && editingId === null && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => startEdit(null)} className="rounded-lg border border-dashed border-bg4 px-3 py-2 text-[12.5px] font-semibold text-text2">
            + Write or paste a document
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-dashed border-bg4 px-3 py-2 text-[12.5px] font-semibold text-text2">
            <IconUpload size={14} /> Upload file
          </button>
          <input ref={fileRef} type="file" accept=".txt,.md,.markdown,.csv" hidden onChange={(e) => upload(e.target.files?.[0])} />
        </div>
      )}
    </div>
  );
}
