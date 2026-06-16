"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconUser, IconMail, IconLock, IconLogout, IconCheck, IconBuildingSkyscraper,
  IconShield,
} from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";

function avatarColor(name: string) {
  const colors = ["#4f46e5", "#0891b2", "#059669", "#d97706", "#dc2626", "#7c3aed", "#db2777"];
  const i = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;
  return colors[i];
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export default function Profile() {
  const router = useRouter();
  const { userName, userEmail, logout, setPage } = useAppStore();

  const [name, setName]         = useState(userName);
  const [email, setEmail]       = useState(userEmail);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw]       = useState("");
  const [saved, setSaved]       = useState<string | null>(null);

  const bg       = avatarColor(userName || "U");
  const initials = getInitials(userName || "U");

  function saveProfile() {
    const stored = JSON.parse(localStorage.getItem("sa_user") ?? "{}");
    localStorage.setItem("sa_user", JSON.stringify({ ...stored, name, email }));
    setSaved("profile");
    setTimeout(() => setSaved(null), 2500);
  }

  function savePassword() {
    if (!currentPw || !newPw) return;
    setSaved("password");
    setCurrentPw("");
    setNewPw("");
    setTimeout(() => setSaved(null), 2500);
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

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--color-text2)",
    display: "block",
    marginBottom: 6,
  };

  return (
    <div className="flex h-full" style={{ background: "var(--color-bg)" }}>
      <div className="flex-1 overflow-y-auto" style={{ padding: "48px 48px 64px" }}>
        <div style={{ maxWidth: 560 }}>

          {/* Avatar + name header */}
          <div
            style={{
              display: "flex", alignItems: "center", gap: 20,
              padding: "28px 28px",
              borderRadius: 18,
              background: "var(--color-bg2)",
              border: "1px solid var(--color-bg4)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              marginBottom: 24,
            }}
          >
            <div
              style={{
                width: 64, height: 64, borderRadius: "50%",
                background: bg,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 22, fontWeight: 800,
                flexShrink: 0,
                boxShadow: `0 4px 16px ${bg}55`,
              }}
            >
              {initials}
            </div>
            <div>
              <p style={{ fontSize: 18, fontWeight: 800, color: "var(--color-text)", margin: 0, letterSpacing: "-0.02em" }}>
                {userName || "User"}
              </p>
              <p style={{ fontSize: 13, color: "var(--color-text3)", margin: "4px 0 0" }}>
                {userEmail}
              </p>
              <span
                style={{
                  display: "inline-block", marginTop: 8,
                  padding: "2px 10px", borderRadius: 99,
                  background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)",
                  fontSize: 11, fontWeight: 600, color: "#059669",
                }}
              >
                Active account
              </span>
            </div>
          </div>

          {/* Personal info */}
          <Section Icon={IconUser} title="Personal information" desc="Update your name and email address">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={labelStyle}>Full name</label>
                <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              </div>
              <div>
                <label style={labelStyle}>Email address</label>
                <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
              </div>
              <SaveRow saved={saved === "profile"} onSave={saveProfile} />
            </div>
          </Section>

          {/* Password */}
          <Section Icon={IconLock} title="Password" desc="Change your login password">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={labelStyle}>Current password</label>
                <input style={inputStyle} type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} placeholder="••••••••" />
              </div>
              <div>
                <label style={labelStyle}>New password</label>
                <input style={inputStyle} type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Min. 6 characters" />
              </div>
              <SaveRow saved={saved === "password"} onSave={savePassword} label="Update password" />
            </div>
          </Section>

          {/* Workspace */}
          <Section Icon={IconBuildingSkyscraper} title="Workspace" desc="Your current plan and usage">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Plan",     value: "Free" },
                { label: "Agents",   value: "1 of 3 used" },
                { label: "Leads",    value: "Unlimited" },
                { label: "Member since", value: new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" }) },
              ].map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", borderRadius: 10,
                    background: "var(--color-bg3)",
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--color-text2)" }}>{row.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>{row.value}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* Danger zone */}
          <Section Icon={IconShield} title="Account" desc="Session and account actions" danger>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 16px", borderRadius: 12,
                  background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)",
                }}
              >
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)", margin: 0 }}>Log out</p>
                  <p style={{ fontSize: 12, color: "var(--color-text3)", margin: "3px 0 0" }}>End your current session</p>
                </div>
                <button
                  onClick={() => { logout(); router.push("/"); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "8px 16px", borderRadius: 9,
                    background: "#ef4444", color: "#fff",
                    fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
                  }}
                >
                  <IconLogout size={14} /> Log out
                </button>
              </div>
            </div>
          </Section>

        </div>
      </div>
    </div>
  );
}

function Section({
  Icon, title, desc, children, danger = false,
}: {
  Icon: React.ElementType;
  title: string;
  desc: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 16,
        background: "var(--color-bg2)",
        border: danger ? "1px solid rgba(239,68,68,0.2)" : "1px solid var(--color-bg4)",
        overflow: "hidden",
        marginBottom: 16,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      {/* Section header */}
      <div
        style={{
          padding: "16px 22px",
          borderBottom: "1px solid var(--color-bg4)",
          display: "flex", alignItems: "center", gap: 12,
          background: danger ? "rgba(239,68,68,0.03)" : undefined,
        }}
      >
        <span
          style={{
            width: 34, height: 34, borderRadius: 9,
            background: danger ? "rgba(239,68,68,0.1)" : "rgba(99,102,241,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <Icon size={16} style={{ color: danger ? "#ef4444" : "#6366f1" }} />
        </span>
        <div>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--color-text)", margin: 0 }}>{title}</p>
          <p style={{ fontSize: 11.5, color: "var(--color-text3)", margin: "2px 0 0" }}>{desc}</p>
        </div>
      </div>
      {/* Body */}
      <div style={{ padding: "20px 22px" }}>{children}</div>
    </div>
  );
}

function SaveRow({ saved, onSave, label = "Save changes" }: { saved: boolean; onSave: () => void; label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
      {saved ? (
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#059669" }}>
          <IconCheck size={13} /> Saved
        </span>
      ) : <span />}
      <button
        onClick={onSave}
        style={{
          padding: "8px 20px", borderRadius: 10,
          background: "linear-gradient(135deg, #4f46e5, #6366f1)",
          color: "#fff", fontSize: 13, fontWeight: 700,
          border: "none", cursor: "pointer",
          boxShadow: "0 4px 12px rgba(79,70,229,0.25)",
        }}
      >
        {label}
      </button>
    </div>
  );
}
