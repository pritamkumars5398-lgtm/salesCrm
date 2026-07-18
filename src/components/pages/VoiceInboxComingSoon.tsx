"use client";
import { IconPhone, IconLock, IconSparkles } from "@tabler/icons-react";

export default function VoiceInboxComingSoon() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6" style={{ background: "var(--color-bg)" }}>
      <div
        className="flex items-center justify-center mb-5"
        style={{ width: 72, height: 72, borderRadius: 20, background: "rgba(245,166,35,0.1)", position: "relative" }}
      >
        <IconPhone size={32} style={{ color: "#f5a623" }} />
        <span
          className="flex items-center justify-center absolute"
          style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--color-bg2)", border: "2px solid var(--color-bg)", bottom: -6, right: -6 }}
        >
          <IconLock size={13} style={{ color: "var(--color-text3)" }} />
        </span>
      </div>
      <span
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full mb-3"
        style={{ background: "rgba(245,166,35,0.12)", color: "#f5a623" }}
      >
        <IconSparkles size={13} /> Coming Soon
      </span>
      <h2 className="text-[18px] font-semibold mb-2" style={{ color: "var(--color-text)" }}>
        Voice Inbox is on its way
      </h2>
      <p className="text-[13px] max-w-[380px]" style={{ color: "var(--color-text3)", lineHeight: 1.6 }}>
        Live call transcripts, recordings and a full call inbox for your AI voice agent are currently
        being built. Check back soon.
      </p>
    </div>
  );
}
