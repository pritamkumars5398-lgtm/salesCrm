"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  IconBrain,
  IconBrandWhatsapp,
  IconPhone,
  IconMail,
  IconMessage,
  IconChartBar,
  IconCalendar,
  IconRobot,
  IconArrowRight,
  IconSparkles,
  IconUsers,
  IconListCheck,
  IconLayoutKanban,
  IconCheck,
  IconMenu2,
  IconX,
  IconRocket,
} from "@tabler/icons-react";
import AuthModal from "@/components/ui/AuthModal";
import ThemeToggle from "@/components/ui/ThemeToggle";
import Button from "@/components/ui/Button";
import { SquiggleArrow, HandNote, SquiggleArrowUpRight, SquiggleArrowDownLeft } from "@/components/ui/HandDrawn";

const FEATURES = [
  {
    Icon: IconBrain,
    color: "#df2a2a",
    bg: "rgba(223,42,42,0.1)",
    title: "AI-Powered Brain",
    desc: "Plug in Claude, GPT-4o, or Gemini. The agent understands context, crafts personalized messages, and adapts tone per lead.",
  },
  {
    Icon: IconListCheck,
    color: "#4dabf7",
    bg: "rgba(77,171,247,0.1)",
    title: "Smart Sequences",
    desc: "Build multi-step outreach cadences across any channel. Set timing, auto-stop on reply, and never miss a follow-up again.",
  },
  {
    Icon: IconBrandWhatsapp,
    color: "#22c97a",
    bg: "rgba(34,201,122,0.1)",
    title: "WhatsApp Outreach",
    desc: "Send AI-written WhatsApp messages at scale via Twilio or 360dialog. Replies land in your unified inbox.",
  },
  {
    Icon: IconPhone,
    color: "#f5a623",
    bg: "rgba(245,166,35,0.1)",
    title: "Voice Calls",
    desc: "AI makes and transcribes real phone calls using Vapi or Bland.ai. Every call logged and summarized automatically.",
  },
  {
    Icon: IconLayoutKanban,
    color: "#cc99ff",
    bg: "rgba(204,153,255,0.1)",
    title: "Built-in CRM",
    desc: "Kanban board to track every lead from first touch to closed deal. Statuses update automatically as the agent works.",
  },
  {
    Icon: IconRobot,
    color: "#df2a2a",
    bg: "rgba(223,42,42,0.1)",
    title: "Lead Scraping",
    desc: "Import leads from LinkedIn, Google Maps, or websites via Apify — no CSV uploads, no manual work.",
  },
  {
    Icon: IconChartBar,
    color: "#ef4444",
    bg: "rgba(239,68,68,0.1)",
    title: "Activity Analytics",
    desc: "See every message sent, call made, reply received. Know exactly what's working and where leads drop off.",
  },
  {
    Icon: IconCalendar,
    color: "#10b981",
    bg: "rgba(16,185,129,0.1)",
    title: "Auto Scheduling",
    desc: "Cron-based triggers run outreach at exactly the right time — morning, evening, or custom windows per timezone.",
  },
  {
    Icon: IconUsers,
    color: "#4dabf7",
    bg: "rgba(77,171,247,0.1)",
    title: "Multi-Agent Setup",
    desc: "Create separate agents for different campaigns, geographies, or products — each with their own config and leads.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Set up your agent",
    desc: "Pick your AI model, connect your channels (Email, WhatsApp, SMS, Voice), and tell the agent about your business and target leads.",
  },
  {
    n: "02",
    title: "Build your sequence",
    desc: "Define a multi-step outreach cadence — day 1 email, day 2 WhatsApp, day 4 call. Set timing, tone, and what happens after no reply.",
  },
  {
    n: "03",
    title: "Import leads & launch",
    desc: "Paste a list, scrape from LinkedIn or Google Maps, or sync your CRM. Hit start — the AI handles everything from first touch to booked meeting.",
  },
];

const CHANNELS = [
  {
    Icon: IconMail,
    color: "#4dabf7",
    bg: "rgba(77,171,247,0.1)",
    label: "Email",
  },
  {
    Icon: IconBrandWhatsapp,
    color: "#22c97a",
    bg: "rgba(34,201,122,0.1)",
    label: "WhatsApp",
  },
  {
    Icon: IconMessage,
    color: "#cc99ff",
    bg: "rgba(204,153,255,0.1)",
    label: "SMS",
  },
  {
    Icon: IconPhone,
    color: "#f5a623",
    bg: "rgba(245,166,35,0.1)",
    label: "Voice Call",
  },
];

const STATS = [
  { value: "4 channels", label: "Email · WhatsApp · SMS · Voice" },
  { value: "10× faster", label: "outreach vs manual SDR" },
  { value: "24 / 7", label: "AI never sleeps or forgets" },
  { value: "0 missed", label: "follow-ups, ever" },
];

const PILLARS = [
  { color: "#df2a2a", title: "Always On", desc: "Your agent emails, messages, and calls leads while your team is offline." },
  { color: "#4dabf7", title: "Channel-Native", desc: "Real email threads, WhatsApp chats, SMS, and voice calls — not just one inbox." },
  { color: "#22c97a", title: "Fast to Launch", desc: "Connect a channel, write a sequence, import leads. Live in minutes, not weeks." },
  { color: "#cc99ff", title: "Built to Convert", desc: "Every reply, call, and status update lands in one CRM view your team already trusts." },
];

const INTEGRATIONS = [
  "Claude", "GPT-4o", "Gemini", "Twilio", "360dialog", "Vapi", "Bland.ai", "Apify",
];

const NAV_LINKS = ["Features", "Channels", "How it works"];

function revealProps(index: number): {
  "data-reveal": string;
  style: CSSProperties;
} {
  return {
    "data-reveal": "",
    style: { "--reveal-index": index } as CSSProperties,
  };
}

export default function Landing({
  onAuth,
}: {
  onAuth: (name: string, email: string) => void;
}) {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  const [scrollY, setScrollY] = useState(0);
  const [isLaunching, setIsLaunching] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: -200, y: -200 });
  const [heroVisible, setHeroVisible] = useState(false);

  const triggerLaunch = () => {
    if (isLaunching) return;
    setIsLaunching(true);
    setTimeout(() => setIsLaunching(false), 2400);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 26;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 26;
    setParallax({ x, y });
    setCursorPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    setParallax({ x: 0, y: 0 });
  };

  const openSignup = () => router.push("/signup");
  const openLogin = () => router.push("/login");

  // Hero entrance animation trigger
  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  // Sticky nav elevation + scroll progress + scroll position
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrollY(y);
      setScrolled(y > 8);
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      setProgress(max > 0 ? Math.min(1, y / max) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scroll-triggered reveal — visible-by-default via CSS, this just adds the trigger
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const closeMobile = () => setMobileOpen(false);

  return (
    <div
      style={{
        fontFamily: "var(--font-sans)",
        background: "var(--color-bg)",
        color: "var(--color-text)",
        overflowX: "hidden",
      }}
    >
      {/* ── SCROLL PROGRESS ── */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 60,
          height: 3,
          width: `${progress * 100}%`,
          background:
            "linear-gradient(90deg, var(--color-primary), var(--color-primary-light))",
          transition: "width 100ms linear",
        }}
      />

      {/* ── NAVBAR ── */}
      <nav
        className={`nav-floating sticky top-0 z-40 flex items-center justify-between px-6 sm:px-12 h-[60px] border-b transition-colors ${scrolled ? "is-scrolled" : "border-transparent bg-transparent backdrop-blur-0"}`}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#df2a2a",
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            Sales<span style={{ color: "#df2a2a" }}>Agent</span>
          </span>
        </div>

        <div
          className="hidden md:flex"
          style={{ alignItems: "center", gap: 28 }}
        >
          {NAV_LINKS.map((l) => (
            <a
              key={l}
              href={`#${l.toLowerCase().replace(/ /g, "-")}`}
              className="link-underline"
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "var(--color-text2)",
              }}
            >
              {l}
            </a>
          ))}
        </div>

        <div
          className="hidden md:flex"
          style={{ alignItems: "center", gap: 10 }}
        >
          <ThemeToggle />
          <Button variant="ghost" size="md" onClick={openLogin}>
            Log in
          </Button>
          <Button variant="primary" size="md" onClick={openSignup}>
            Get started free →
          </Button>
        </div>

        {/* Mobile toggle */}
        <div
          className="flex md:hidden"
          style={{ alignItems: "center", gap: 6 }}
        >
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon-md"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <IconX size={19} /> : <IconMenu2 size={19} />}
          </Button>
        </div>
      </nav>

      {/* Mobile menu panel */}
      {mobileOpen && (
        <div
          className="flex flex-col md:hidden animate-slide-down"
          style={{
            position: "sticky",
            top: 60,
            zIndex: 39,
            background: "var(--color-bg2)",
            borderBottom: "1px solid var(--color-bg4)",
            padding: "18px 24px 22px",
            gap: 16,
            boxShadow: "var(--shadow-md)",
          }}
        >
          {NAV_LINKS.map((l) => (
            <a
              key={l}
              href={`#${l.toLowerCase().replace(/ /g, "-")}`}
              onClick={closeMobile}
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--color-text2)",
              }}
            >
              {l}
            </a>
          ))}
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <Button
              variant="secondary"
              size="md"
              style={{ flex: 1 }}
              onClick={openLogin}
            >
              Log in
            </Button>
            <Button
              variant="primary"
              size="md"
              style={{ flex: 1 }}
              onClick={openSignup}
            >
              Get started
            </Button>
          </div>
        </div>
      )}

      {/* ── HERO (PedalStart Style) ── */}
      <section
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          position: "relative",
          padding: "clamp(110px, 14vh, 150px) 24px 70px",
          textAlign: "center",
          overflow: "visible",
          minHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* ── Custom Cursor Glow (PedalStart style) ── */}
        <div
          aria-hidden
          className="cursor-glow"
          style={{
            position: "fixed",
            left: cursorPos.x,
            top: cursorPos.y,
            width: 380,
            height: 380,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(223,42,42,0.10) 0%, rgba(223,42,42,0.03) 50%, transparent 70%)",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            zIndex: 9999,
            mixBlendMode: "multiply",
            transition: "left 0.08s ease-out, top 0.08s ease-out",
          }}
        />

        {/* ── Background Orbit Rings — full-bleed, half-page spanning ── */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: `translate(-50%, -50%) translate3d(${parallax.x * 0.06}px, ${parallax.y * 0.06}px, 0)`,
            width: "min(1100px, 100vw)",
            height: "min(1100px, 100vw)",
            pointerEvents: "none",
            zIndex: 0,
            /* Radial vignette: fade icons near edges so they dissolve into bg.
               Icons sit at 76-100% radius (ring insets), so the fade must start
               past that or the whole outer ring renders fully transparent. */
            maskImage: "radial-gradient(ellipse 50% 50% at 50% 50%, black 88%, transparent 120%)",
            WebkitMaskImage: "radial-gradient(ellipse 50% 50% at 50% 50%, black 88%, transparent 120%)",
          }}
        >
          {/* Outer orbit ring track */}
          <div style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "1px solid rgba(223,42,42,0.09)",
            animation: "orbitSpin 36s linear infinite",
          }}>
            {/* Email — right */}
            <div style={{
              position: "absolute", top: "50%", left: "100%",
              transform: "translate(-50%, -50%)",
              width: 52, height: 52, borderRadius: 14,
              background: "rgba(77,171,247,0.1)",
              border: "1px solid rgba(77,171,247,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(10px)",
              animation: "orbitSpin 36s linear infinite reverse",
              boxShadow: "0 4px 20px rgba(77,171,247,0.12)",
            }}>
              <IconMail size={22} style={{ color: "#4dabf7" }} />
            </div>
            {/* WhatsApp — bottom */}
            <div style={{
              position: "absolute", top: "100%", left: "50%",
              transform: "translate(-50%, -50%)",
              width: 52, height: 52, borderRadius: 14,
              background: "rgba(34,201,122,0.1)",
              border: "1px solid rgba(34,201,122,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(10px)",
              animation: "orbitSpin 36s linear infinite reverse",
              boxShadow: "0 4px 20px rgba(34,201,122,0.12)",
            }}>
              <IconBrandWhatsapp size={22} style={{ color: "#22c97a" }} />
            </div>
            {/* Voice — left */}
            <div style={{
              position: "absolute", top: "50%", left: 0,
              transform: "translate(-50%, -50%)",
              width: 52, height: 52, borderRadius: 14,
              background: "rgba(245,166,35,0.1)",
              border: "1px solid rgba(245,166,35,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(10px)",
              animation: "orbitSpin 36s linear infinite reverse",
              boxShadow: "0 4px 20px rgba(245,166,35,0.12)",
            }}>
              <IconPhone size={22} style={{ color: "#f5a623" }} />
            </div>
            {/* SMS — top */}
            <div style={{
              position: "absolute", top: 0, left: "50%",
              transform: "translate(-50%, -50%)",
              width: 52, height: 52, borderRadius: 14,
              background: "rgba(204,153,255,0.1)",
              border: "1px solid rgba(204,153,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(10px)",
              animation: "orbitSpin 36s linear infinite reverse",
              boxShadow: "0 4px 20px rgba(204,153,255,0.12)",
            }}>
              <IconMessage size={22} style={{ color: "#cc99ff" }} />
            </div>
          </div>

          {/* Mid orbit ring — diagonal icons */}
          <div style={{
            position: "absolute",
            inset: "130px",
            borderRadius: "50%",
            border: "1px solid rgba(223,42,42,0.06)",
            animation: "orbitSpin 24s linear infinite reverse",
          }}>
            {/* Brain — right */}
            <div style={{
              position: "absolute", top: "50%", left: "100%",
              transform: "translate(-50%, -50%)",
              width: 42, height: 42, borderRadius: 11,
              background: "rgba(223,42,42,0.08)",
              border: "1px solid rgba(223,42,42,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(8px)",
              animation: "orbitSpin 24s linear infinite",
              boxShadow: "0 4px 16px rgba(223,42,42,0.1)",
            }}>
              <IconBrain size={19} style={{ color: "var(--color-primary)" }} />
            </div>
            {/* Calendar — bottom */}
            <div style={{
              position: "absolute", top: "100%", left: "50%",
              transform: "translate(-50%, -50%)",
              width: 42, height: 42, borderRadius: 11,
              background: "rgba(59,130,246,0.08)",
              border: "1px solid rgba(59,130,246,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(8px)",
              animation: "orbitSpin 24s linear infinite",
              boxShadow: "0 4px 16px rgba(59,130,246,0.1)",
            }}>
              <IconCalendar size={19} style={{ color: "#3b82f6" }} />
            </div>
            {/* Robot — left */}
            <div style={{
              position: "absolute", top: "50%", left: 0,
              transform: "translate(-50%, -50%)",
              width: 42, height: 42, borderRadius: 11,
              background: "rgba(139,92,246,0.08)",
              border: "1px solid rgba(139,92,246,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(8px)",
              animation: "orbitSpin 24s linear infinite",
              boxShadow: "0 4px 16px rgba(139,92,246,0.1)",
            }}>
              <IconRobot size={19} style={{ color: "#8b5cf6" }} />
            </div>
            {/* Chart — top */}
            <div style={{
              position: "absolute", top: 0, left: "50%",
              transform: "translate(-50%, -50%)",
              width: 42, height: 42, borderRadius: 11,
              background: "rgba(16,185,129,0.08)",
              border: "1px solid rgba(16,185,129,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(8px)",
              animation: "orbitSpin 24s linear infinite",
              boxShadow: "0 4px 16px rgba(16,185,129,0.1)",
            }}>
              <IconChartBar size={19} style={{ color: "#10b981" }} />
            </div>
          </div>

          {/* Inner ring — subtle */}
          <div style={{
            position: "absolute",
            inset: "260px",
            borderRadius: "50%",
            border: "1px dashed rgba(223,42,42,0.05)",
            animation: "orbitSpin 16s linear infinite",
          }} />
        </div>


        {/* Top Right Circle Indicator — PedalStart detail */}
        <div
          aria-hidden
          className="hidden sm:flex"
          style={{
            position: "absolute",
            top: 24,
            right: 32,
            zIndex: 10,
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "var(--color-primary)",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 16px var(--color-primary-glow)",
            transition: "transform 0.3s ease",
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#ffffff",
            }}
          />
        </div>

        {/* Perspective floor grid — 3D ground plane with mouse parallax */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            overflow: "hidden",
            perspective: "500px",
            perspectiveOrigin: "50% 100%",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "-30%",
              right: "-30%",
              bottom: 0,
              height: "75%",
              backgroundImage: `
                linear-gradient(rgba(223,42,42,0.14) 1px, transparent 1px),
                linear-gradient(90deg, rgba(223,42,42,0.14) 1px, transparent 1px)
              `,
              backgroundSize: "52px 52px",
              transform: `rotateX(72deg) translate3d(${parallax.x * 0.15}px, ${parallax.y * 0.15 + Math.min(scrollY * 0.1, 40)}px, 0)`,
              transformOrigin: "bottom",
              maskImage: "linear-gradient(to top, black 20%, transparent 85%)",
              WebkitMaskImage:
                "linear-gradient(to top, black 20%, transparent 85%)",
              transition: "transform 0.15s ease-out",
            }}
          />
        </div>

        {/* Grain texture */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            opacity: 0.035,
            mixBlendMode: "overlay",
            pointerEvents: "none",
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />

        {/* Ambient background glow wash */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: "20%",
            left: "50%",
            transform: "translateX(-50%)",
            width: 750,
            height: 420,
            zIndex: 0,
            background:
              "radial-gradient(ellipse at center, rgba(223,42,42,0.16) 0%, rgba(77,171,247,0.06) 50%, transparent 75%)",
            pointerEvents: "none",
            filter: "blur(40px)",
          }}
        />

        {/* Main Center Content Container */}
        <div
          style={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            maxWidth: 1000,
            width: "100%",
          }}
        >
          {/* Eyebrow badge */}
          <div
            {...revealProps(0)}
            style={{
              ...revealProps(0).style,
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "6px 14px",
              borderRadius: 99,
              background: "var(--color-primary-glow)",
              border: "1px solid rgba(223,42,42,0.22)",
              marginBottom: 22,
            }}
          >
            <IconSparkles size={14} style={{ color: "var(--color-primary)" }} />
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                color: "var(--color-primary)",
                letterSpacing: "0.01em",
              }}
            >
              AI outbound that runs itself
            </span>
          </div>

          {/* PedalStart Layout with Original SalesAgent Text */}
          <div
            {...revealProps(1)}
            style={{
              ...revealProps(1).style,
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 32,
              userSelect: "none",
            }}
          >
            {/* ROW 1: While You Sleep, Your AI — word-by-word entrance */}
            <div style={{ position: "relative", display: "inline-block", paddingTop: 16 }}>
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(28px, 4.2vw, 48px)",
                  fontWeight: 300,
                  color: "var(--color-text)",
                  letterSpacing: "-0.01em",
                  lineHeight: 1.25,
                  margin: 0,
                  paddingBottom: 2,
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: "0.25em",
                  overflow: "hidden",
                }}
              >
                {"While You Sleep, Your AI".split(" ").map((word, i) => (
                  <span
                    key={i}
                    style={{
                      display: "inline-block",
                      opacity: heroVisible ? 1 : 0,
                      transform: heroVisible ? "translateY(0)" : "translateY(24px)",
                      transition: `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${i * 80}ms, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${i * 80}ms`,
                    }}
                  >
                    {word}
                  </span>
                ))}
              </h1>

              {/* Hand-drawn Callout: AI never sleeps (pointing up-right) */}
              <div
                className="hidden sm:flex animate-float"
                style={{
                  position: "absolute",
                  top: -14,
                  left: "95%",
                  whiteSpace: "nowrap",
                  alignItems: "center",
                  gap: 8,
                  color: "var(--color-primary)",
                  pointerEvents: "none",
                  transform: `translate3d(${parallax.x * 0.4}px, ${parallax.y * 0.4}px, 0)`,
                  transition: "transform 0.15s ease-out",
                }}
              >
                <SquiggleArrowUpRight color="var(--color-primary)" size={44} rotate={-10} />
                <span
                  style={{
                    fontFamily: "var(--font-hand)",
                    fontSize: "clamp(19px, 2.2vw, 26px)",
                    fontWeight: 600,
                    color: "var(--color-primary)",
                  }}
                >
                  AI never sleeps
                </span>
              </div>
            </div>

            {/* ROW 2: Sales Agent + ROCKET TAKE-OFF */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "clamp(16px, 4vw, 44px)",
                margin: "4px 0",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(48px, 8.5vw, 98px)",
                  fontWeight: 800,
                  fontStyle: "italic",
                  background: "linear-gradient(135deg, var(--color-primary), #f24444)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  letterSpacing: "-0.01em",
                  lineHeight: 1.25,
                  padding: "0.1em 0.15em",
                  opacity: heroVisible ? 1 : 0,
                  transform: heroVisible ? "translateY(0) scale(1)" : "translateY(32px) scale(0.96)",
                  transition: "opacity 0.7s cubic-bezier(0.16,1,0.3,1) 400ms, transform 0.7s cubic-bezier(0.16,1,0.3,1) 400ms",
                }}
              >
                Sales Agent
              </span>

              {/* Dynamic Flying Rocket ("Rocket ko uda do") with Scroll Flight & Click Launch */}
              <div
                onClick={triggerLaunch}
                className={isLaunching ? "animate-rocket-takeoff" : "animate-rocket"}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  cursor: "pointer",
                  transform: isLaunching
                    ? undefined
                    : `translate3d(${parallax.x * 0.7}px, ${parallax.y * 0.7 - Math.min(scrollY * 0.85, 360)}px, 0)`,
                  transition: isLaunching
                    ? "none"
                    : "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
                title="Click to launch rocket into space!"
              >
                <IconRocket
                  size={105}
                  stroke={1.25}
                  style={{
                    color: "var(--color-primary)",
                    transform: "rotate(-30deg)",
                    filter: "drop-shadow(0 4px 16px var(--color-primary-glow))",
                  }}
                />
                {/* Vertical thrust animation lines under engine */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "center",
                    gap: 6,
                    marginTop: 4,
                  }}
                >
                  <span
                    className="animate-thrust"
                    style={{
                      width: 2,
                      height: isLaunching ? 52 : 24,
                      borderRadius: 1,
                      background: "var(--color-primary)",
                      animationDelay: "0s",
                      transition: "height 0.2s ease",
                    }}
                  />
                  <span
                    className="animate-thrust"
                    style={{
                      width: 2.5,
                      height: isLaunching ? 74 : 38,
                      borderRadius: 1,
                      background: "var(--color-primary)",
                      animationDelay: "0.15s",
                      transition: "height 0.2s ease",
                    }}
                  />
                  <span
                    className="animate-thrust"
                    style={{
                      width: 2,
                      height: isLaunching ? 44 : 18,
                      borderRadius: 1,
                      background: "var(--color-primary)",
                      animationDelay: "0.3s",
                      transition: "height 0.2s ease",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* ROW 3: Keeps Working. — word entrance */}
            <div style={{ position: "relative", display: "inline-block" }}>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(28px, 4.2vw, 48px)",
                  fontWeight: 300,
                  color: "var(--color-text)",
                  letterSpacing: "-0.01em",
                  lineHeight: 1.25,
                  margin: 0,
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: "0.25em",
                }}
              >
                {"Keeps Working.".split(" ").map((word, i) => (
                  <span
                    key={i}
                    style={{
                      display: "inline-block",
                      opacity: heroVisible ? 1 : 0,
                      transform: heroVisible ? "translateY(0)" : "translateY(24px)",
                      transition: `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${700 + i * 80}ms, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${700 + i * 80}ms`,
                    }}
                  >
                    {word}
                  </span>
                ))}
              </span>

              {/* Hand-drawn Callout: 0 missed follow-ups (pointing down-left) */}
              <div
                className="hidden sm:flex animate-float-delayed"
                style={{
                  position: "absolute",
                  top: 20,
                  right: "94%",
                  whiteSpace: "nowrap",
                  alignItems: "center",
                  gap: 8,
                  color: "var(--color-primary)",
                  pointerEvents: "none",
                  transform: `translate3d(${-parallax.x * 0.4}px, ${-parallax.y * 0.4}px, 0)`,
                  transition: "transform 0.15s ease-out",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-hand)",
                    fontSize: "clamp(19px, 2.2vw, 26px)",
                    fontWeight: 600,
                    color: "var(--color-primary)",
                  }}
                >
                  0 missed follow-ups
                </span>
                <SquiggleArrowDownLeft color="var(--color-primary)" size={44} rotate={10} />
              </div>
            </div>
          </div>

          {/* Original Sub-headline Paragraph & CTA Buttons */}
          <p
            {...revealProps(2)}
            style={{
              ...revealProps(2).style,
              fontSize: "clamp(16px, 1.8vw, 19px)",
              color: "var(--color-text3)",
              lineHeight: 1.75,
              maxWidth: 560,
              margin: "0 auto 36px",
            }}
          >
            SalesAgent runs personalized outreach across Email, WhatsApp, SMS,
            and Voice — 24/7 — so your team focuses on closing, not chasing.
          </p>

          <div
            {...revealProps(3)}
            style={{
              ...revealProps(3).style,
              display: "flex",
              justifyContent: "center",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <Button
              variant="primary"
              size="lg"
              rightIcon={<IconArrowRight size={16} />}
              onClick={openSignup}
            >
              Start for free
            </Button>
            <Button variant="secondary" size="lg" onClick={openLogin}>
              Log in to dashboard
            </Button>
          </div>

          <p
            {...revealProps(3)}
            style={{
              ...revealProps(3).style,
              fontSize: 12.5,
              color: "var(--color-text3)",
              marginTop: 14,
            }}
          >
            No credit card required · Live in under 5 minutes
          </p>

          {/* Original Stat pills with brand color */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 10,
              marginTop: 44,
              flexWrap: "wrap",
            }}
          >
            {STATS.map((s, i) => (
              <div
                key={s.value}
                {...revealProps(i + 4)}
                className="card-hover"
                style={{
                  ...revealProps(i + 4).style,
                  padding: "8px 20px",
                  borderRadius: 99,
                  background: "var(--color-bg2)",
                  border: "1px solid var(--color-bg4)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                }}
              >
                <span
                  style={{ fontSize: 14, fontWeight: 800, color: "var(--color-primary)" }}
                >
                  {s.value}
                </span>
                <span style={{ fontSize: 13, color: "var(--color-text3)" }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MISSION STATEMENT ── */}
      <section style={{ padding: "72px 48px 8px", textAlign: "center" }}>
        <div {...revealProps(0)} style={{ ...revealProps(0).style, maxWidth: 780, margin: "0 auto" }}>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(24px, 3.6vw, 36px)",
              fontWeight: 700,
              lineHeight: 1.35,
              color: "var(--color-text)",
            }}
          >
            We&apos;re the outbound engine{" "}
            <span
              style={{
                fontFamily: "var(--font-hand)",
                color: "var(--color-primary)",
                fontSize: "1.25em",
                fontWeight: 600,
              }}
            >
              growing sales teams
            </span>{" "}
            run on.
          </h2>
          <p
            style={{
              fontSize: 16,
              color: "var(--color-text3)",
              lineHeight: 1.75,
              maxWidth: 620,
              margin: "18px auto 0",
            }}
          >
            SalesAgent replaces the busywork of outbound prospecting with an AI
            agent that emails, messages, and calls leads on your behalf — so
            founders and reps spend their time closing, not chasing.
          </p>
        </div>
      </section>

      {/* ── PRODUCT HIGHLIGHT (stat badges over an abstract panel) ── */}
      <section style={{ padding: "56px 48px 88px" }}>
        <div
          className="grid grid-cols-1 lg:grid-cols-2"
          style={{
            maxWidth: 980,
            margin: "0 auto",
            gap: 56,
            alignItems: "center",
          }}
        >
          <div {...revealProps(0)} style={revealProps(0).style}>
            <p
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--color-primary)",
                marginBottom: 12,
              }}
            >
              Always working
            </p>
            <h3
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(22px, 3vw, 28px)",
                fontWeight: 800,
                letterSpacing: "-0.02em",
                marginBottom: 16,
              }}
            >
              Outreach that doesn&apos;t clock out.
            </h3>
            <p style={{ fontSize: 15, color: "var(--color-text3)", lineHeight: 1.75, marginBottom: 14 }}>
              SalesAgent works the queue around the clock — sending the next email,
              following up on WhatsApp, or placing a call — exactly when your
              sequence says to, in any timezone.
            </p>
            <p style={{ fontSize: 15, color: "var(--color-text3)", lineHeight: 1.75 }}>
              Every reply, booked meeting, and status change flows straight back
              into your CRM, so your team always knows where a lead stands.
            </p>
          </div>

          <div {...revealProps(1)} style={{ ...revealProps(1).style, position: "relative" }}>
            <div
              aria-hidden
              className="card"
              style={{
                height: 300,
                borderRadius: 20,
                background:
                  "linear-gradient(135deg, var(--color-bg3), var(--color-bg2))",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: `
                    linear-gradient(rgba(223,42,42,0.08) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(223,42,42,0.08) 1px, transparent 1px)
                  `,
                  backgroundSize: "28px 28px",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 24,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ height: 14, width: "55%", borderRadius: 7, background: "var(--color-bg4)" }} />
                <div style={{ flex: 1, borderRadius: 12, background: "var(--color-bg)", border: "1px solid var(--color-bg4)" }} />
              </div>
            </div>

            <div
              className="card-hover"
              style={{
                position: "absolute",
                top: -18,
                left: -18,
                background: "var(--color-green)",
                color: "#06301f",
                borderRadius: 14,
                padding: "12px 18px",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <p style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>24 / 7</p>
              <p style={{ fontSize: 11.5, fontWeight: 600, margin: 0, opacity: 0.85 }}>AI outreach</p>
            </div>
            <div
              className="card-hover"
              style={{
                position: "absolute",
                bottom: -18,
                right: -18,
                background: "var(--color-bg2)",
                border: "1px solid var(--color-bg4)",
                borderRadius: 14,
                padding: "12px 18px",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <p style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "var(--color-primary)" }}>4 channels</p>
              <p style={{ fontSize: 11.5, fontWeight: 600, margin: 0, color: "var(--color-text3)" }}>live at once</p>
            </div>
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
        <p
          {...revealProps(0)}
          style={{
            ...revealProps(0).style,
            textAlign: "center",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--color-text3)",
            marginBottom: 32,
          }}
        >
          Reach leads everywhere they are
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          {CHANNELS.map((ch, i) => (
            <div
              key={ch.label}
              {...revealProps(i + 1)}
              className="card card-hover"
              style={{
                ...revealProps(i + 1).style,
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "16px 28px",
                borderRadius: 16,
                background: "var(--color-bg)",
                minWidth: 160,
              }}
            >
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 11,
                  background: ch.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <ch.Icon size={20} style={{ color: ch.color }} />
              </span>
              <div>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--color-text)",
                    margin: 0,
                  }}
                >
                  {ch.label}
                </p>
                <p
                  style={{
                    fontSize: 11.5,
                    color: "var(--color-text3)",
                    margin: "2px 0 0",
                  }}
                >
                  AI outreach
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PILLARS ── */}
      <section style={{ padding: "88px 48px 64px", textAlign: "center" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2
            {...revealProps(0)}
            style={{
              ...revealProps(0).style,
              fontFamily: "var(--font-display)",
              fontSize: "clamp(22px, 3.2vw, 32px)",
              fontWeight: 700,
              lineHeight: 1.35,
              marginBottom: 56,
            }}
          >
            We&apos;re not another CRM you configure and forget — we&apos;re the
            outreach team that{" "}
            <span
              style={{
                fontFamily: "var(--font-hand)",
                color: "var(--color-primary)",
                fontSize: "1.2em",
                fontWeight: 600,
              }}
            >
              keeps working.
            </span>
          </h2>

          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
            style={{ gap: 32, textAlign: "left" }}
          >
            {PILLARS.map((p, i) => (
              <div
                key={p.title}
                {...revealProps(i)}
                style={{
                  ...revealProps(i).style,
                  borderLeft: `3px solid ${p.color}`,
                  paddingLeft: 16,
                }}
              >
                <h3
                  style={{
                    fontFamily: "var(--font-hand)",
                    color: p.color,
                    fontSize: 25,
                    fontWeight: 600,
                    marginBottom: 8,
                  }}
                >
                  {p.title}
                </h3>
                <p style={{ fontSize: 13.5, color: "var(--color-text3)", lineHeight: 1.65 }}>
                  {p.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── INTEGRATIONS MARQUEE ── */}
      <section
        style={{
          padding: "40px 0 88px",
          borderTop: "1px solid var(--color-bg4)",
        }}
      >
        <p
          style={{
            textAlign: "center",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--color-text3)",
            marginBottom: 28,
          }}
        >
          Works with the tools you already run on
        </p>
        <div
          className="marquee-viewport"
          style={{
            overflow: "hidden",
            maskImage:
              "linear-gradient(90deg, transparent, black 10%, black 90%, transparent)",
            WebkitMaskImage:
              "linear-gradient(90deg, transparent, black 10%, black 90%, transparent)",
          }}
        >
          <div className="marquee-track" style={{ gap: 12, paddingRight: 12 }}>
            {[...INTEGRATIONS, ...INTEGRATIONS].map((name, i) => (
              <span
                key={`${name}-${i}`}
                style={{
                  flexShrink: 0,
                  padding: "10px 22px",
                  borderRadius: 99,
                  border: "1px solid var(--color-bg4)",
                  background: "var(--color-bg2)",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--color-text2)",
                  fontFamily: "var(--font-display)",
                }}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── IMPACT NUMBERS ── */}
      <section
        style={{
          padding: "88px 48px",
          textAlign: "center",
          background: "var(--color-bg2)",
          borderTop: "1px solid var(--color-bg4)",
          borderBottom: "1px solid var(--color-bg4)",
        }}
      >
        <h2
          {...revealProps(0)}
          style={{
            ...revealProps(0).style,
            fontFamily: "var(--font-display)",
            fontSize: "clamp(24px, 3.6vw, 36px)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            marginBottom: 12,
          }}
        >
          Turning outreach into pipeline.
        </h2>
        <p
          {...revealProps(1)}
          style={{
            ...revealProps(1).style,
            fontSize: 15,
            color: "var(--color-text3)",
            maxWidth: 480,
            margin: "0 auto 56px",
          }}
        >
          The numbers teams see after switching their outbound to SalesAgent.
        </p>

        <div
          className="grid grid-cols-2 lg:grid-cols-4"
          style={{ maxWidth: 960, margin: "0 auto", gap: 40 }}
        >
          {STATS.map((s, i) => (
            <div key={s.value} {...revealProps(i)} style={revealProps(i).style}>
              <p
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(28px, 4vw, 40px)",
                  fontWeight: 800,
                  color: "var(--color-green)",
                  marginBottom: 4,
                }}
              >
                {s.value}
              </p>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  color: "var(--color-primary)",
                }}
              >
                <SquiggleArrow rotate={90} />
                <span
                  style={{
                    fontFamily: "var(--font-hand)",
                    fontSize: 18,
                    fontWeight: 600,
                    marginTop: -4,
                  }}
                >
                  {s.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding: "88px 48px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <p
            {...revealProps(0)}
            style={{
              ...revealProps(0).style,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#df2a2a",
              marginBottom: 12,
            }}
          >
            Everything you need
          </p>
          <h2
            {...revealProps(0)}
            style={{
              ...revealProps(0).style,
              fontFamily: "var(--font-display)",
              fontSize: "clamp(26px, 4vw, 38px)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              marginBottom: 12,
            }}
          >
            One platform. End-to-end pipeline.
          </h2>
          <p
            {...revealProps(1)}
            style={{
              ...revealProps(1).style,
              fontSize: 16,
              color: "var(--color-text3)",
              maxWidth: 520,
              lineHeight: 1.7,
              marginBottom: 52,
            }}
          >
            From lead scraping to booked meetings — SalesAgent handles the
            entire outbound workflow so your team never has to touch it.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                {...revealProps(i)}
                className="card card-hover"
                style={{
                  ...revealProps(i).style,
                  padding: "24px 22px",
                  borderRadius: 16,
                }}
              >
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 11,
                    background: f.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 16,
                  }}
                >
                  <f.Icon size={20} style={{ color: f.color }} />
                </span>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--color-text)",
                    marginBottom: 8,
                  }}
                >
                  {f.title}
                </p>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--color-text3)",
                    lineHeight: 1.65,
                  }}
                >
                  {f.desc}
                </p>
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
          <p
            {...revealProps(0)}
            style={{
              ...revealProps(0).style,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#df2a2a",
              marginBottom: 12,
            }}
          >
            How it works
          </p>
          <h2
            {...revealProps(0)}
            style={{
              ...revealProps(0).style,
              fontFamily: "var(--font-display)",
              fontSize: "clamp(26px, 4vw, 38px)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              marginBottom: 52,
            }}
          >
            Live in minutes, not months.
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 24,
            }}
          >
            {STEPS.map((s, i) => (
              <div
                key={s.n}
                {...revealProps(i)}
                style={{ ...revealProps(i).style, position: "relative" }}
              >
                {/* Connector line */}
                {i < STEPS.length - 1 && (
                  <div
                    aria-hidden
                    className="hidden lg:block"
                    style={{
                      position: "absolute",
                      top: 20,
                      left: "calc(100% - 12px)",
                      width: "calc(100% - 20px)",
                      height: 1,
                      background:
                        "linear-gradient(90deg, rgba(223,42,42,0.35), transparent)",
                    }}
                  />
                )}
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#df2a2a",
                    letterSpacing: "0.08em",
                    marginBottom: 16,
                    padding: "4px 10px",
                    borderRadius: 6,
                    background: "rgba(223,42,42,0.08)",
                    display: "inline-block",
                  }}
                >
                  {s.n}
                </div>
                <h3
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 16,
                    fontWeight: 700,
                    marginBottom: 10,
                    color: "var(--color-text)",
                  }}
                >
                  {s.title}
                </h3>
                <p
                  style={{
                    fontSize: 13.5,
                    color: "var(--color-text3)",
                    lineHeight: 1.7,
                  }}
                >
                  {s.desc}
                </p>
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
            position: "absolute",
            inset: 0,
            backgroundImage: `
              linear-gradient(rgba(223,42,42,0.06) 1px, transparent 1px),
              linear-gradient(90deg, rgba(223,42,42,0.06) 1px, transparent 1px)
            `,
            backgroundSize: "44px 44px",
          }}
        />
        <div
          aria-hidden
          className="animate-float"
          style={{
            position: "absolute",
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: 600,
            height: 300,
            background:
              "radial-gradient(ellipse at center, rgba(223,42,42,0.14) 0%, transparent 70%)",
          }}
        />

        <div
          {...revealProps(0)}
          style={{
            ...revealProps(0).style,
            position: "relative",
            zIndex: 1,
            maxWidth: 560,
            margin: "0 auto",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(26px, 4vw, 40px)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              marginBottom: 16,
            }}
          >
            Ready to put your sales on autopilot?
          </h2>
          <p
            style={{
              fontSize: 16,
              color: "var(--color-text3)",
              lineHeight: 1.7,
              marginBottom: 8,
            }}
          >
            Set up your first agent in under 5 minutes. No credit card required.
          </p>
          <div
            aria-hidden
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 6,
              color: "var(--color-primary)",
              marginBottom: 32,
            }}
          >
            <SquiggleArrow rotate={90} />
            <span
              style={{ fontFamily: "var(--font-hand)", fontSize: 20, fontWeight: 600 }}
            >
              seriously, that fast
            </span>
          </div>

          {/* Inline signup form */}
          <div
            className="card"
            style={{
              borderRadius: 20,
              padding: 32,
              boxShadow: "var(--shadow-lg)",
              textAlign: "left",
            }}
          >
            <p
              style={{
                fontSize: 14,
                fontWeight: 700,
                marginBottom: 20,
                color: "var(--color-text)",
              }}
            >
              Create your free account
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                readOnly
                onFocus={openSignup}
                placeholder="Your full name"
                className="form-input"
                style={{ cursor: "text" }}
              />
              <input
                readOnly
                onFocus={openSignup}
                placeholder="you@company.com"
                className="form-input"
                style={{ cursor: "text" }}
              />
              <Button
                variant="primary"
                style={{ width: "100%" }}
                rightIcon={<IconArrowRight size={15} />}
                onClick={openSignup}
              >
                Get started — it&apos;s free
              </Button>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                marginTop: 16,
                flexWrap: "wrap",
              }}
            >
              {["No credit card", "Setup in 5 min", "Cancel anytime"].map(
                (t) => (
                  <span
                    key={t}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 11.5,
                      color: "var(--color-text3)",
                    }}
                  >
                    <IconCheck
                      size={12}
                      style={{ color: "#10b981", flexShrink: 0 }}
                    />{" "}
                    {t}
                  </span>
                ),
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer
        style={{
          padding: "24px 48px",
          borderTop: "1px solid var(--color-bg4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#df2a2a",
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            Sales<span style={{ color: "#df2a2a" }}>Agent</span>
          </span>
        </div>
        <p style={{ fontSize: 12, color: "var(--color-text3)" }}>
          © {new Date().getFullYear()} SalesAgent · AI-powered sales outreach
        </p>
        <button
          onClick={openLogin}
          className="link-underline"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#df2a2a",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          Log in →
        </button>
      </footer>
    </div>
  );
}
