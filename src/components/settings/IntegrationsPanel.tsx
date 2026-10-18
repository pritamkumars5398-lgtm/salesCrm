"use client";
import { useCallback, useEffect, useState } from "react";
import { IconAlertTriangle, IconCircleCheck, IconCircleX, IconPlugConnected, IconRefresh } from "@tabler/icons-react";
import { apiGet } from "@/lib/api/client";

interface UsageLine {
  label: string;
  used?: number;
  limit?: number;
  text?: string;
}

interface Integration {
  key: string;
  name: string;
  purpose: string;
  source: "workspace" | "platform" | "none";
  keyHint?: string;
  status: "ok" | "warning" | "error" | "not_configured" | "unchecked";
  detail: string;
  usage: UsageLine[];
  settingsTab: string;
}

interface Props {
  /** /api/integrations/status?agentId=… or /api/superadmin/integrations */
  endpoint: string;
  title: string;
  subtitle: string;
  /** open the Settings tab that fixes an integration (omit on the platform view) */
  onOpenTab?: (tab: string) => void;
}

const STATUS_STYLE: Record<Integration["status"], { label: string; color: string; Icon: React.ElementType }> = {
  ok: { label: "Working", color: "#10b981", Icon: IconCircleCheck },
  warning: { label: "Needs attention", color: "#f59e0b", Icon: IconAlertTriangle },
  error: { label: "Not working", color: "#ef4444", Icon: IconCircleX },
  not_configured: { label: "Not set up", color: "var(--color-text4)", Icon: IconPlugConnected },
  unchecked: { label: "Saved", color: "#6366f1", Icon: IconPlugConnected },
};

const SOURCE_LABEL = { workspace: "This workspace's key", platform: "Platform key (.env)", none: "" };

function UsageBar({ line }: { line: UsageLine }) {
  if (line.text !== undefined) {
    return (
      <div className="flex justify-between text-[12px]">
        <span className="text-text3">{line.label}</span>
        <span className="font-semibold text-text2">{line.text}</span>
      </div>
    );
  }
  const pct = line.limit ? Math.min(100, Math.round(((line.used ?? 0) / line.limit) * 100)) : 0;
  const color = pct >= 90 ? "#ef4444" : pct >= 75 ? "#f59e0b" : "#10b981";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[12px]">
        <span className="text-text3">{line.label}</span>
        <span className="font-semibold text-text2">
          {(line.used ?? 0).toLocaleString("en-IN")}{line.limit ? ` / ${line.limit.toLocaleString("en-IN")}` : ""}
        </span>
      </div>
      {line.limit ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-bg4">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
        </div>
      ) : null}
    </div>
  );
}

/** One place to see every API key: whose it is, whether it works, and how much is left. */
export default function IntegrationsPanel({ endpoint, title, subtitle, onOpenTab }: Props) {
  const [items, setItems] = useState<Integration[] | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiGet<{ checkedAt: string; integrations: Integration[] }>(endpoint);
      setItems(res.integrations);
      setCheckedAt(res.checkedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check the integrations");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { load(); }, [load]);

  const problems = items?.filter((i) => i.status === "error" || i.status === "warning").length ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-semibold text-text">{title}</h3>
          <p className="text-[12px] leading-relaxed text-text3">{subtitle}</p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-bg4 bg-bg2 px-3 py-1.5 text-[12px] font-semibold text-text2 disabled:opacity-60">
          <IconRefresh size={13} className={loading ? "animate-spin" : ""} /> {loading ? "Checking…" : "Check again"}
        </button>
      </div>

      {error && <p className="text-[12px] text-red-500">{error}</p>}
      {items && (
        <p className="text-[11.5px] text-text3">
          {problems ? `${problems} need${problems === 1 ? "s" : ""} attention` : "Everything set up is working"}
          {checkedAt && ` · checked ${new Date(checkedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`}
        </p>
      )}
      {!items && loading && <p className="text-[12px] text-text3">Asking each provider… (takes a few seconds)</p>}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {items?.map((item) => {
          const st = STATUS_STYLE[item.status];
          return (
            <div key={item.key} className="flex flex-col gap-2 rounded-xl border border-bg4 bg-bg2 p-3.5">
              <div className="flex items-start gap-2">
                <st.Icon size={16} style={{ color: st.color, flexShrink: 0, marginTop: 2 }} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-text">{item.name}</p>
                  <p className="text-[11.5px] text-text3">{item.purpose}</p>
                </div>
                <span className="whitespace-nowrap text-[11px] font-bold" style={{ color: st.color }}>{st.label}</span>
              </div>
              {(item.keyHint || item.source !== "none") && (
                <p className="text-[11px] text-text3">
                  {SOURCE_LABEL[item.source]}{item.keyHint ? ` · key ${item.keyHint}` : ""}
                </p>
              )}
              {item.detail && <p className="text-[12px] leading-relaxed text-text2">{item.detail}</p>}
              {item.usage.length > 0 && (
                <div className="flex flex-col gap-1.5 border-t border-bg3 pt-2">
                  {item.usage.map((u) => <UsageBar key={u.label} line={u} />)}
                </div>
              )}
              {onOpenTab && item.settingsTab && item.status !== "ok" && (
                <button onClick={() => onOpenTab(item.settingsTab)} className="self-start text-[12px] font-semibold text-text2 underline">
                  {item.status === "not_configured" ? "Set it up" : "Fix in Settings"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
