"use client";
import { useState } from "react";
import {
  IconBrain, IconBrandWhatsapp, IconPhone, IconMail, IconMessage,
  IconChartBar, IconCalendar, IconRobot, IconArrowRight, IconX,
  IconSparkles, IconUsers, IconListCheck, IconLayoutKanban, IconCheck,
} from "@tabler/icons-react";

interface AuthModalProps {
  mode: "login" | "signup";
  onClose: () => void;
  onAuth: (name: string, email: string) => void;
}

function AuthModal({ mode: initialMode, onClose, onAuth }: AuthModalProps) {
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email || !password) { setError("All fields are required."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }

    if (mode === "signup") {
      if (!name) { setError("Name is required."); return; }
      localStorage.setItem("sa_user", JSON.stringify({ name, email, password }));
      onAuth(name, email);
    } else {
      const stored = localStorage.getItem("sa_user");
      if (!stored) {
        // Auto-create on first login (demo mode)
        const autoName = email.split("@")[0];
        localStorage.setItem("sa_user", JSON.stringify({ name: autoName, email, password }));
        onAuth(autoName, email);
        return;
      }
      const user = JSON.parse(stored);
      if (user.email !== email) { setError("Email not found."); return; }
      onAuth(user.name, user.email);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid var(--color-bg4)",
    background: "var(--color-bg)",
    color: "var(--color-text)",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full"
        style={{
          maxWidth: 420,
          background: "var(--color-bg2)",
          borderRadius: 20,
          padding: "36px 36px 32px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.18)",
          border: "1px solid var(--color-bg4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", color: "var(--color-text3)", padding: 4 }}
        >
          <IconX size={18} />
        </button>

        {/* Brand */}
        <div className="flex items-center gap-2 mb-6">
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#6366f1" }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text)" }}>
            Sales<span style={{ color: "#6366f1" }}>Agent</span>
          </span>
        </div>

        {/* Tabs */}
        <div className="flex mb-6" style={{ borderBottom: "1px solid var(--color-bg4)" }}>
          {(["signup", "login"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(""); }}
              style={{
                flex: 1,
                paddingBottom: 12,
                fontSize: 13,
                fontWeight: 600,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: mode === m ? "#4f46e5" : "var(--color-text3)",
                borderBottom: mode === m ? "2px solid #4f46e5" : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {m === "signup" ? "Create account" : "Log in"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {mode === "signup" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Full name</label>
              <input style={inputStyle} placeholder="Rajesh Kumar" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Email address</label>
            <input style={inputStyle} type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Password</label>
            <input style={inputStyle} type="password" placeholder="Min. 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          {error && (
            <p style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>{error}</p>
          )}

          <button
            type="submit"
            style={{
              marginTop: 4,
              padding: "11px 20px",
              borderRadius: 10,
              background: "linear-gradient(135deg, #4f46e5, #6366f1)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(79,70,229,0.3)",
              width: "100%",
            }}
          >
            {mode === "signup" ? "Create free account →" : "Log in →"}
          </button>
        </form>

        <p style={{ fontSize: 11.5, color: "var(--color-text3)", textAlign: "center", marginTop: 16 }}>
          By continuing you agree to our Terms & Privacy Policy.
        </p>
      </div>
    </div>
  );
}

const FEATURES = [
  { Icon: IconBrain,        color: "#6366f1", bg: "rgba(99,102,241,0.1)",  title: "AI-Powered Brain",      desc: "Plug in Claude, GPT-4o, or Gemini. The agent understands context, crafts personalized messages, and adapts tone per lead." },
  { Icon: IconListCheck,    color: "#4dabf7", bg: "rgba(77,171,247,0.1)",  title: "Smart Sequences",       desc: "Build multi-step outreach cadences across any channel. Set timing, auto-stop on reply, and never miss a follow-up again." },
  { Icon: IconBrandWhatsapp,color: "#22c97a", bg: "rgba(34,201,122,0.1)",  title: "WhatsApp Outreach",     desc: "Send AI-written WhatsApp messages at scale via Twilio or 360dialog. Replies land in your unified inbox." },
  { Icon: IconPhone,        color: "#f5a623", bg: "rgba(245,166,35,0.1)",  title: "Voice Calls",           desc: "AI makes and transcribes real phone calls using Vapi or Bland.ai. Every call logged and summarized automatically." },
  { Icon: IconLayoutKanban, color: "#cc99ff", bg: "rgba(204,153,255,0.1)", title: "Built-in CRM",          desc: "Kanban board to track every lead from first touch to closed deal. Statuses update automatically as the agent works." },
  { Icon: IconRobot,        color: "#6366f1", bg: "rgba(99,102,241,0.1)",  title: "Lead Scraping",         desc: "Import leads from LinkedIn, Google Maps, or websites via Apify — no CSV uploads, no manual work." },
  { Icon: IconChartBar,     color: "#ef4444", bg: "rgba(239,68,68,0.1)",   title: "Activity Analytics",    desc: "See every message sent, call made, reply received. Know exactly what's working and where leads drop off." },
  { Icon: IconCalendar,     color: "#10b981", bg: "rgba(16,185,129,0.1)",  title: "Auto Scheduling",       desc: "Cron-based triggers run outreach at exactly the right time — morning, evening, or custom windows per timezone." },
  { Icon: IconUsers,        color: "#4dabf7", bg: "rgba(77,171,247,0.1)",  title: "Multi-Agent Setup",     desc: "Create separate agents for different campaigns, geographies, or products — each with their own config and leads." },
];

const STEPS = [
  { n: "01", title: "Set up your agent",      desc: "Pick your AI model, connect your channels (Email, WhatsApp, SMS, Voice), and tell the agent about your business and target leads." },
  { n: "02", title: "Build your sequence",    desc: "Define a multi-step outreach cadence — day 1 email, day 2 WhatsApp, day 4 call. Set timing, tone, and what happens after no reply." },
  { n: "03", title: "Import leads & launch",  desc: "Paste a list, scrape from LinkedIn or Google Maps, or sync your CRM. Hit start — the AI handles everything from first touch to booked meeting." },
];

const CHANNELS = [
  { Icon: IconMail,           color: "#4dabf7", bg: "rgba(77,171,247,0.1)",  label: "Email" },
  { Icon: IconBrandWhatsapp,  color: "#22c97a", bg: "rgba(34,201,122,0.1)",  label: "WhatsApp" },
  { Icon: IconMessage,        color: "#cc99ff", bg: "rgba(204,153,255,0.1)", label: "SMS" },
  { Icon: IconPhone,          color: "#f5a623", bg: "rgba(245,166,35,0.1)",  label: "Voice Call" },
];

const STATS = [
  { value: "4 channels",   label: "Email · WhatsApp · SMS · Voice" },
  { value: "10× faster",   label: "outreach vs manual SDR" },
  { value: "24 / 7",       label: "AI never sleeps or forgets" },
  { value: "0 missed",     label: "follow-ups, ever" },
];

export default function Landing({ onAuth }: { onAuth: (name: string, email: string) => void }) {
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);

  const openSignup = () => setAuthMode("signup");
  const openLogin  = () => setAuthMode("login");

  return (
    <div style={{ fontFamily: "var(--font-sans)", background: "var(--color-bg)", color: "var(--color-text)", overflowX: "hidden" }}>

      {/* ── NAVBAR ── */}
      <nav
        style={{
          position: "sticky", top: 0, zIndex: 40,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 48px", height: 60,
          background: "rgba(248,250,252,0.85)", backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--color-bg4)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#6366f1" }} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>
            Sales<span style={{ color: "#6366f1" }}>Agent</span>
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {["Features", "Channels", "How it works"].map((l) => (
            <a
              key={l}
              href={`#${l.toLowerCase().replace(/ /g, "-")}`}
              style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text2)", textDecoration: "none" }}
            >
              {l}
            </a>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={openLogin}
            style={{ fontSize: 13, fontWeight: 600, background: "none", border: "none", cursor: "pointer", color: "var(--color-text2)", padding: "8px 16px" }}
          >
            Log in
          </button>
          <button
            onClick={openSignup}
            style={{
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              padding: "8px 18px", borderRadius: 10,
              background: "linear-gradient(135deg, #4f46e5, #6366f1)",
              color: "#fff", border: "none",
              boxShadow: "0 4px 12px rgba(79,70,229,0.28)",
            }}
          >
            Get started free →
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section
        style={{
          position: "relative",
          padding: "100px 48px 80px",
          textAlign: "center",
          overflow: "hidden",
          minHeight: "88vh",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}
      >
        {/* Grid bg */}
        <div
          aria-hidden
          style={{
            position: "absolute", inset: 0, zIndex: 0,
            backgroundImage: `
              linear-gradient(rgba(99,102,241,0.07) 1px, transparent 1px),
              linear-gradient(90deg, rgba(99,102,241,0.07) 1px, transparent 1px)
            `,
            backgroundSize: "44px 44px",
          }}
        />
        {/* Glow */}
        <div
          aria-hidden
          style={{
            position: "absolute", top: "10%", left: "50%", transform: "translateX(-50%)",
            width: 700, height: 400, zIndex: 0,
            background: "radial-gradient(ellipse at center, rgba(99,102,241,0.18) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative", zIndex: 1, maxWidth: 780 }}>
          {/* Badge */}
          <div
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "5px 14px", borderRadius: 999,
              background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
              fontSize: 12, fontWeight: 600, color: "#6366f1",
              marginBottom: 28,
            }}
          >
            <IconSparkles size={13} />
            AI-first sales outreach platform
          </div>

          <h1
            style={{
              fontSize: "clamp(38px, 6vw, 62px)", fontWeight: 800,
              lineHeight: 1.1, letterSpacing: "-0.03em",
              color: "var(--color-text)", marginBottom: 22,
            }}
          >
            Your AI sales agent that{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #4f46e5, #818cf8)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              never stops
            </span>
            {" "}reaching out
          </h1>

          <p
            style={{
              fontSize: 18, color: "var(--color-text3)", lineHeight: 1.7,
              maxWidth: 580, margin: "0 auto 40px",
            }}
          >
            SalesAgent runs personalized outreach across Email, WhatsApp, SMS, and Voice — 24/7 —
            so your team focuses on closing, not chasing.
          </p>

          <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              onClick={openSignup}
              style={{
                padding: "14px 30px", borderRadius: 12,
                background: "linear-gradient(135deg, #4f46e5, #6366f1)",
                color: "#fff", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer",
                boxShadow: "0 6px 20px rgba(79,70,229,0.35)",
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              Start for free <IconArrowRight size={16} />
            </button>
            <button
              onClick={openLogin}
              style={{
                padding: "14px 30px", borderRadius: 12,
                background: "var(--color-bg2)", color: "var(--color-text2)",
                fontSize: 14, fontWeight: 600,
                border: "1px solid var(--color-bg4)", cursor: "pointer",
              }}
            >
              Log in to dashboard
            </button>
          </div>

          {/* Stat pills */}
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 48, flexWrap: "wrap" }}>
            {STATS.map((s) => (
              <div
                key={s.value}
                style={{
                  padding: "8px 18px", borderRadius: 99,
                  background: "var(--color-bg2)", border: "1px solid var(--color-bg4)",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                  display: "flex", alignItems: "baseline", gap: 7,
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 800, color: "#4f46e5" }}>{s.value}</span>
                <span style={{ fontSize: 12, color: "var(--color-text3)" }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CHANNELS ── */}
      <section
        id="channels"
        style={{
          padding: "64px 48px",
          background: "var(--color-bg2)",
          borderTop: "1px solid var(--color-bg4)",
          borderBottom: "1px solid var(--color-bg4)",
        }}
      >
        <p style={{ textAlign: "center", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-text3)", marginBottom: 32 }}>
          Reach leads everywhere they are
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
          {CHANNELS.map((ch) => (
            <div
              key={ch.label}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "16px 28px", borderRadius: 16,
                background: "var(--color-bg)", border: "1px solid var(--color-bg4)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                minWidth: 160,
              }}
            >
              <span style={{ width: 40, height: 40, borderRadius: 11, background: ch.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <ch.Icon size={20} style={{ color: ch.color }} />
              </span>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text)", margin: 0 }}>{ch.label}</p>
                <p style={{ fontSize: 11.5, color: "var(--color-text3)", margin: "2px 0 0" }}>AI outreach</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding: "88px 48px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6366f1", marginBottom: 12 }}>
            Everything you need
          </p>
          <h2 style={{ fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 12 }}>
            One platform. End-to-end pipeline.
          </h2>
          <p style={{ fontSize: 16, color: "var(--color-text3)", maxWidth: 520, lineHeight: 1.7, marginBottom: 52 }}>
            From lead scraping to booked meetings — SalesAgent handles the entire outbound workflow so your team never has to touch it.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {FEATURES.map((f) => (
              <div
                key={f.title}
                style={{
                  padding: "24px 22px",
                  borderRadius: 16,
                  background: "var(--color-bg2)",
                  border: "1px solid var(--color-bg4)",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                  transition: "box-shadow 0.2s, transform 0.2s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 24px rgba(0,0,0,0.08)";
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)";
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                }}
              >
                <span style={{ width: 40, height: 40, borderRadius: 11, background: f.bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                  <f.Icon size={20} style={{ color: f.color }} />
                </span>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text)", marginBottom: 8 }}>{f.title}</p>
                <p style={{ fontSize: 13, color: "var(--color-text3)", lineHeight: 1.65 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section
        id="how-it-works"
        style={{
          padding: "88px 48px",
          background: "var(--color-bg2)",
          borderTop: "1px solid var(--color-bg4)",
          borderBottom: "1px solid var(--color-bg4)",
        }}
      >
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6366f1", marginBottom: 12 }}>
            How it works
          </p>
          <h2 style={{ fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 52 }}>
            Live in minutes, not months.
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 24 }}>
            {STEPS.map((s, i) => (
              <div key={s.n} style={{ position: "relative" }}>
                {/* Connector line */}
                {i < STEPS.length - 1 && (
                  <div
                    aria-hidden
                    style={{
                      position: "absolute", top: 20, left: "calc(100% - 12px)",
                      width: "calc(100% - 20px)", height: 1,
                      background: "linear-gradient(90deg, var(--color-bg4), transparent)",
                      display: "none",
                    }}
                  />
                )}
                <div
                  style={{
                    fontSize: 11, fontWeight: 800, color: "#6366f1",
                    letterSpacing: "0.08em", marginBottom: 16,
                    padding: "4px 10px", borderRadius: 6, background: "rgba(99,102,241,0.08)",
                    display: "inline-block",
                  }}
                >
                  {s.n}
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: "var(--color-text)" }}>{s.title}</h3>
                <p style={{ fontSize: 13.5, color: "var(--color-text3)", lineHeight: 1.7 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA / SIGNUP ── */}
      <section
        style={{
          position: "relative",
          padding: "96px 48px",
          textAlign: "center",
          overflow: "hidden",
        }}
      >
        {/* Grid bg */}
        <div
          aria-hidden
          style={{
            position: "absolute", inset: 0,
            backgroundImage: `
              linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px),
              linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px)
            `,
            backgroundSize: "44px 44px",
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
            width: 600, height: 300,
            background: "radial-gradient(ellipse at center, rgba(99,102,241,0.14) 0%, transparent 70%)",
          }}
        />

        <div style={{ position: "relative", zIndex: 1, maxWidth: 560, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(26px, 4vw, 40px)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 16 }}>
            Ready to put your sales on autopilot?
          </h2>
          <p style={{ fontSize: 16, color: "var(--color-text3)", lineHeight: 1.7, marginBottom: 40 }}>
            Set up your first agent in under 5 minutes. No credit card required.
          </p>

          {/* Inline signup form */}
          <div
            style={{
              background: "var(--color-bg2)", borderRadius: 20, padding: 32,
              border: "1px solid var(--color-bg4)", boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
              textAlign: "left",
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 20, color: "var(--color-text)" }}>
              Create your free account
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                readOnly
                onFocus={openSignup}
                placeholder="Your full name"
                style={{
                  padding: "10px 14px", borderRadius: 10,
                  border: "1px solid var(--color-bg4)", background: "var(--color-bg)",
                  fontSize: 13, color: "var(--color-text3)", outline: "none", cursor: "text",
                }}
              />
              <input
                readOnly
                onFocus={openSignup}
                placeholder="you@company.com"
                style={{
                  padding: "10px 14px", borderRadius: 10,
                  border: "1px solid var(--color-bg4)", background: "var(--color-bg)",
                  fontSize: 13, color: "var(--color-text3)", outline: "none", cursor: "text",
                }}
              />
              <button
                onClick={openSignup}
                style={{
                  padding: "12px 20px", borderRadius: 10,
                  background: "linear-gradient(135deg, #4f46e5, #6366f1)",
                  color: "#fff", fontSize: 13, fontWeight: 700,
                  border: "none", cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(79,70,229,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                Get started — it&apos;s free <IconArrowRight size={15} />
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
              {["No credit card", "Setup in 5 min", "Cancel anytime"].map((t) => (
                <span key={t} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--color-text3)" }}>
                  <IconCheck size={12} style={{ color: "#10b981", flexShrink: 0 }} /> {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer
        style={{
          padding: "24px 48px",
          borderTop: "1px solid var(--color-bg4)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#6366f1" }} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>Sales<span style={{ color: "#6366f1" }}>Agent</span></span>
        </div>
        <p style={{ fontSize: 12, color: "var(--color-text3)" }}>
          © {new Date().getFullYear()} SalesAgent · AI-powered sales outreach
        </p>
        <button
          onClick={openLogin}
          style={{ fontSize: 12, fontWeight: 600, color: "#6366f1", background: "none", border: "none", cursor: "pointer" }}
        >
          Log in →
        </button>
      </footer>

      {/* Auth modal */}
      {authMode && (
        <AuthModal
          mode={authMode}
          onClose={() => setAuthMode(null)}
          onAuth={(name, email) => { setAuthMode(null); onAuth(name, email); }}
        />
      )}
    </div>
  );
}
