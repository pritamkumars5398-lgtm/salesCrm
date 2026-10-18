"use client";
import { useEffect, useState } from "react";
import { IconCircleCheck, IconCircleX, IconHelpCircle, IconLoader2, IconRefresh, IconSparkles, IconTool } from "@tabler/icons-react";

interface CheckResult {
  keyValid: boolean;
  keyError?: string;
  permissions: Record<"convai_read" | "convai_write" | "voices_read", boolean | null>;
  agents: { id: string; name: string }[] | null;
  agent: null | { id: string; found: boolean; unknown?: boolean; name?: string; issues: string[] };
  ready: boolean;
  elevenAgentId: string;
}

interface Props {
  agentId: string;
  /** the ElevenLabs key currently in the form (may be unsaved) */
  apiKey: string;
  /** keep the form's Agent ID field in sync after select/create */
  onAgentIdChange: (id: string) => void;
}

const PERMISSIONS: { key: keyof CheckResult["permissions"]; label: string; why: string }[] = [
  { key: "convai_write", label: "ElevenAgents — Write", why: "required to start calls" },
  { key: "convai_read", label: "ElevenAgents — Read", why: "required to find and check your agent (Write includes it)" },
  { key: "voices_read", label: "Voices — Read", why: "only for the voice preview (also give Text to Speech: Access)" },
];

function Row({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  const Icon = ok === null ? IconHelpCircle : ok ? IconCircleCheck : IconCircleX;
  const color = ok === null ? "var(--color-text3)" : ok ? "#22c97a" : "#ff6b6b";
  return (
    <div className="flex items-start gap-2 text-[12px] leading-[1.5]">
      <Icon size={15} className="flex-shrink-0 mt-[2px]" style={{ color }} />
      <div className="min-w-0" style={{ color: "var(--color-text2)" }}>{children}</div>
    </div>
  );
}

export default function ElevenLabsSetupPanel({ agentId, apiKey, onAgentIdChange }: Props) {
  const [result, setResult] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState<null | "check" | "select" | "fix" | "create">(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState("");

  async function run(action: "check" | "select" | "fix" | "create", elevenAgentId?: string) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/voice/elevenlabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, action, apiKey, elevenAgentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "ElevenLabs check failed");
      setResult(data);
      if (action !== "check" && data.elevenAgentId) onAgentIdChange(data.elevenAgentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ElevenLabs check failed");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => { run("check"); }, [agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const missing = result ? PERMISSIONS.filter((p) => result.permissions[p.key] === false) : [];
  const canManageAgents = result?.keyValid && result.permissions.convai_read !== false && result.permissions.convai_write !== false;

  return (
    <div className="mt-8 rounded-2xl border overflow-hidden" style={{ borderColor: "rgba(204,153,255,0.25)", background: "rgba(204,153,255,0.04)" }}>
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b" style={{ borderColor: "rgba(204,153,255,0.15)", background: "rgba(204,153,255,0.06)" }}>
        <IconTool size={15} style={{ color: "#cc99ff" }} />
        <span className="text-[13px] font-semibold" style={{ color: "var(--color-text)" }}>ElevenLabs setup check</span>
        {result && (
          <span
            className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
            style={result.ready ? { background: "rgba(34,201,122,0.15)", color: "#22c97a" } : { background: "rgba(255,107,107,0.14)", color: "#ff6b6b" }}
          >
            {result.ready ? "Ready for calls" : "Calls will fail"}
          </span>
        )}
        <button
          onClick={() => run("check")}
          disabled={!!busy}
          className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-md"
          style={{ background: "var(--color-bg3)", color: "var(--color-text2)", cursor: busy ? "wait" : "pointer" }}
        >
          {busy === "check" ? <IconLoader2 size={13} className="animate-spin" /> : <IconRefresh size={13} />}
          Check again
        </button>
      </div>

      <div className="px-5 py-4 flex flex-col gap-3">
        <p className="text-[11.5px] m-0" style={{ color: "var(--color-text3)" }}>
          Tests the Voice API Key above (even before you save it) and the ElevenLabs agent your calls use.
        </p>

        {error && <Row ok={false}>{error}</Row>}
        {!result && !error && (
          <div className="text-[12px] flex items-center gap-2" style={{ color: "var(--color-text3)" }}>
            <IconLoader2 size={13} className="animate-spin" /> Checking…
          </div>
        )}

        {result && (
          <>
            {/* API key */}
            <Row ok={result.keyValid}>
              {result.keyValid ? "API key is valid" : <>API key rejected: {result.keyError}</>}
            </Row>

            {/* Permissions */}
            {result.keyValid && PERMISSIONS.map((p) => (
              <Row key={p.key} ok={result.permissions[p.key]}>
                {p.label} <span style={{ color: "var(--color-text3)" }}>— {p.why}</span>
              </Row>
            ))}
            {missing.length > 0 && (
              <div className="rounded-lg px-3 py-2.5 text-[11.5px] leading-[1.55]" style={{ background: "rgba(255,107,107,0.08)", color: "var(--color-text2)" }}>
                <b>Fix the key in ElevenLabs:</b> go to <b>Developers → API Keys</b>, edit this key (or create a new one) and
                set {missing.map((p) => <b key={p.key}>{p.label}</b>).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, ", ", el] : [el]), [])}
                {" "}— or switch off <b>“Restrict key”</b>. Paste the key into <b>Voice API Key</b> above and press <b>Check again</b>.
              </div>
            )}

            {/* Agent */}
            {result.keyValid && (
              <Row ok={result.agent ? (result.agent.unknown ? null : result.agent.found) : false}>
                {!result.agent ? "No ElevenLabs Agent ID set."
                  : result.agent.unknown ? <>Can&apos;t look up agent <code>{result.agent.id}</code> until the key has ElevenAgents access.</>
                  : result.agent.found ? <>Agent <b>{result.agent.name}</b> found on this account</>
                  : <>Agent <code>{result.agent.id}</code> doesn&apos;t exist on this key&apos;s ElevenLabs account (it belongs to another account).</>}
              </Row>
            )}

            {canManageAgents && (!result.agent || !result.agent.found) && (
              <div className="flex flex-wrap items-center gap-2 pl-6">
                {result.agents && result.agents.length > 0 && (
                  <>
                    <select
                      value={picked}
                      onChange={(e) => setPicked(e.target.value)}
                      className="text-[12px] rounded-md px-2 py-1.5 border outline-none"
                      style={{ background: "var(--color-bg3)", borderColor: "var(--color-bg4)", color: "var(--color-text)" }}
                    >
                      <option value="">Use an existing agent…</option>
                      {result.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <button
                      onClick={() => picked && run("select", picked)}
                      disabled={!picked || !!busy}
                      className="text-[11.5px] font-semibold px-2.5 py-1.5 rounded-md"
                      style={{ background: "var(--color-bg3)", color: picked ? "var(--color-text)" : "var(--color-text3)" }}
                    >
                      {busy === "select" ? "Saving…" : "Use this agent"}
                    </button>
                    <span className="text-[11px]" style={{ color: "var(--color-text3)" }}>or</span>
                  </>
                )}
                <button
                  onClick={() => run("create")}
                  disabled={!!busy}
                  className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1.5 rounded-md text-white"
                  style={{ background: "linear-gradient(135deg,#8b5cf6,#6c63ff)", cursor: busy ? "wait" : "pointer" }}
                >
                  {busy === "create" ? <IconLoader2 size={13} className="animate-spin" /> : <IconSparkles size={13} />}
                  Create a phone-ready agent for me
                </button>
              </div>
            )}

            {/* Agent call settings */}
            {result.agent?.found && (
              result.agent.issues.length === 0 ? (
                <Row ok={true}>Agent call settings look right (phone audio, overrides, hang-up tools, language)</Row>
              ) : (
                <>
                  {result.agent.issues.map((issue) => <Row key={issue} ok={false}>{issue}</Row>)}
                  <div className="pl-6">
                    <button
                      onClick={() => run("fix", result.agent!.id)}
                      disabled={!!busy}
                      className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1.5 rounded-md text-white"
                      style={{ background: "linear-gradient(135deg,#22c97a,#10b981)", cursor: busy ? "wait" : "pointer" }}
                    >
                      {busy === "fix" ? <IconLoader2 size={13} className="animate-spin" /> : <IconTool size={13} />}
                      Fix agent settings
                    </button>
                  </div>
                </>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
