"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { IconBrandWhatsapp, IconMail, IconMessage } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import type { Channel } from "@/store/types";
import ChannelInboxPanel from "@/components/inbox/ChannelInboxPanel";
import SoonBadge from "@/components/ui/SoonBadge";
import { isComingSoonChannel } from "@/lib/constants/coming-soon";

const TABS: { id: Channel; label: string; Icon: React.ElementType; color: string }[] = [
  { id: "whatsapp", label: "WhatsApp", Icon: IconBrandWhatsapp, color: "#22c97a" },
  { id: "email", label: "Email", Icon: IconMail, color: "#4dabf7" },
  { id: "sms", label: "SMS", Icon: IconMessage, color: "#cc99ff" },
];

export default function Inbox() {
  const { activeAgent } = useAppStore();
  const router = useRouter();
  const searchParams = useSearchParams();

  const requested = searchParams.get("channel");
  const channel: Channel = TABS.some((t) => t.id === requested) && !isComingSoonChannel(requested) ? (requested as Channel) : "whatsapp";

  function switchChannel(next: Channel) {
    const params = new URLSearchParams(window.location.search);
    params.set("channel", next);
    router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false });
  }

  if (!activeAgent) return null;

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--color-bg)" }}>
      <div className="flex items-center gap-1.5 px-4 border-b flex-shrink-0" style={{ borderColor: "var(--color-bg4)", height: 52 }}>
        {TABS.map(({ id, label, Icon, color }) => {
          const active = channel === id;
          const soon = isComingSoonChannel(id);
          return (
            <button
              key={id}
              disabled={soon}
              title={soon ? `${label} is coming soon` : undefined}
              onClick={() => switchChannel(id)}
              className={`flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 border-none transition-all duration-150 ${soon ? "cursor-default opacity-60" : "cursor-pointer"}`}
              style={{
                height: 34,
                borderRadius: 9,
                background: active ? `${color}1f` : "transparent",
                color: active ? color : "var(--color-text3)",
              }}
              onMouseEnter={(e) => { if (!active && !soon) e.currentTarget.style.background = "var(--color-bg3)"; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
            >
              <Icon size={15} style={{ color: active ? color : "var(--color-text3)" }} />
              {label}
              {soon && <SoonBadge />}
            </button>
          );
        })}
      </div>

      <ChannelInboxPanel key={channel} channel={channel} agentId={activeAgent._id} />
    </div>
  );
}
