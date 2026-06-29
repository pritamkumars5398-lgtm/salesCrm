"use client";
import { useState } from "react";
import { IconArrowLeft, IconEye, IconEyeOff } from "@tabler/icons-react";
import { authLogin, authSignup } from "@/lib/auth";

interface Props {
  mode: "login" | "signup";
  onClose: () => void;
  onAuth: (name: string, email: string) => void;
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10,
  border: "1px solid var(--color-bg4)", background: "transparent",
  color: "var(--color-text)", fontSize: 13, outline: "none", boxSizing: "border-box",
  boxShadow: "none",
};

export default function AuthModal({ mode: initialMode, onClose, onAuth }: Props) {
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Onboarding Wizard steps
  const [signupStep, setSignupStep] = useState(1);
  const [businessName, setBusinessName] = useState("");
  const [businessWebsite, setBusinessWebsite] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessServices, setBusinessServices] = useState("");
  const [docLink, setDocLink] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");

  const TEXTAREA_STYLE: React.CSSProperties = {
    ...INPUT_STYLE,
    minHeight: 70,
    resize: "vertical",
    padding: "8px 12px",
    fontFamily: "inherit",
  };

  async function handleAction(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (mode === "login") {
      if (!email || !password) { setError("All fields are required."); return; }
      setLoading(true);
      try {
        const result = await authLogin(email, password);
        if (result.error) { setError(result.error); return; }
        onAuth(result.user!.name, result.user!.email);
      } catch (err) {
        setError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Sign up flow
    if (signupStep === 1) {
      if (!name || !email || !password) { setError("Name, Email, and Password are required."); return; }
      if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
      setSignupStep(2);
    } else if (signupStep === 2) {
      if (!businessName) { setError("Please specify your Business Name."); return; }
      setSignupStep(3);
    } else if (signupStep === 3) {
      // Save onboarding fields to localStorage
      const onboardingData = {
        businessName: businessName.trim(),
        businessWebsite: businessWebsite.trim(),
        businessPhone: businessPhone.trim(),
        businessServices: businessServices.trim(),
        docLink: docLink.trim(),
        customPrompt: customPrompt.trim(),
        followUpDays: "3", // default 3 follow-ups
      };
      localStorage.setItem("sa_onboarding", JSON.stringify(onboardingData));

      setLoading(true);
      try {
        const result = await authSignup(name, email, password);
        if (result.error) { setError(result.error); return; }
        onAuth(name.trim(), email);
      } catch (err) {
        setError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-between"
      style={{
        background: "transparent",
        minHeight: "100vh",
        width: "100vw",
        overflowY: "auto",
        fontFamily: "var(--font-sans)",
        boxSizing: "border-box",
        padding: "24px 48px",
      }}
    >
      {/* Grid background */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          backgroundImage: `
            linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px)
          `,
          backgroundSize: "44px 44px",
          pointerEvents: "none",
        }}
      />
      {/* Glow */}
      {/* <div
        aria-hidden
        style={{
          position: "absolute",
          top: "10%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 700,
          height: 400,
          zIndex: 0,
          background: "radial-gradient(ellipse at center, rgba(99,102,241,0.14) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      /> */}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", zIndex: 10 }}>
        <button
          onClick={onClose}
          disabled={loading}
          style={{
            background: "none",
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            color: "var(--color-text2)",
            padding: 0,
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 14,
            fontWeight: 600,
            opacity: loading ? 0.6 : 1,
          }}
        >
          <IconArrowLeft size={18} />
          <span>Back to Home</span>
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#6366f1" }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text)" }}>
            Sales<span style={{ color: "#6366f1" }}>Agent</span>
          </span>
        </div>
      </div>

      {/* Center content */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1, zIndex: 1, margin: "40px 0" }}>
        <div
          className="relative w-full"
          style={{
            maxWidth: 440,
            background: "transparent",
            borderRadius: 24,
            padding: "0 20px",
            zIndex: 1,
            boxSizing: "border-box",
          }}
        >


          {mode === "login" ? (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px 0", color: "var(--color-text)" }}>Log in to your account</h2>
              <p style={{ fontSize: 13, color: "var(--color-text3)", margin: 0, lineHeight: 1.5 }}>Welcome back! Enter your email and password to access the sales platform.</p>
            </div>
          ) : (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px 0", color: "var(--color-text)" }}>
                {signupStep === 1 ? "Create your free account" : signupStep === 2 ? "Tell us about your business" : "Personalize your AI assistant"}
              </h2>
              <p style={{ fontSize: 13, color: "var(--color-text3)", margin: 0, lineHeight: 1.5 }}>
                {signupStep === 1
                  ? "Start automating your outreach across Email, WhatsApp, and SMS today."
                  : signupStep === 2
                    ? "We use your website, services, and phone number to configure your agent brain."
                    : "Upload a resources brochure link and write custom instructions for your agent."}
              </p>
            </div>
          )}

          {mode === "signup" && (
            <div className="flex items-center justify-between mb-4">
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text3)", textTransform: "uppercase" }}>
                Step {signupStep} of 3
              </span>
              <div style={{ display: "flex", gap: 4, width: "60%" }}>
                <div style={{ flex: 1, height: 3, borderRadius: 2, background: signupStep >= 1 ? "#6366f1" : "var(--color-bg4)" }} />
                <div style={{ flex: 1, height: 3, borderRadius: 2, background: signupStep >= 2 ? "#6366f1" : "var(--color-bg4)" }} />
                <div style={{ flex: 1, height: 3, borderRadius: 2, background: signupStep >= 3 ? "#6366f1" : "var(--color-bg4)" }} />
              </div>
            </div>
          )}

          <form onSubmit={handleAction} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {mode === "login" ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Email address</label>
                  <input disabled={loading} style={INPUT_STYLE} type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Password</label>
                  <div style={{ position: "relative", width: "100%" }}>
                    <input
                      disabled={loading}
                      style={{ ...INPUT_STYLE, paddingRight: 40 }}
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: "absolute",
                        right: 12,
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        cursor: loading ? "not-allowed" : "pointer",
                        color: "var(--color-text3)",
                        padding: 4,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {showPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {signupStep === 1 && (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Full name</label>
                      <input disabled={loading} style={INPUT_STYLE} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Email address</label>
                      <input disabled={loading} style={INPUT_STYLE} type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Password</label>
                      <div style={{ position: "relative", width: "100%" }}>
                        <input
                          disabled={loading}
                          style={{ ...INPUT_STYLE, paddingRight: 40 }}
                          type={showPassword ? "text" : "password"}
                          placeholder="Min. 6 characters"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => setShowPassword(!showPassword)}
                          style={{
                            position: "absolute",
                            right: 12,
                            top: "50%",
                            transform: "translateY(-50%)",
                            background: "none",
                            border: "none",
                            cursor: loading ? "not-allowed" : "pointer",
                            color: "var(--color-text3)",
                            padding: 4,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {showPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {signupStep === 2 && (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Business name</label>
                      <input disabled={loading} style={INPUT_STYLE} placeholder="e.g. Acme Inc" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Business website (optional)</label>
                      <input disabled={loading} style={INPUT_STYLE} placeholder="e.g. https://acme.com" value={businessWebsite} onChange={(e) => setBusinessWebsite(e.target.value)} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Business phone number (optional)</label>
                      <input disabled={loading} style={INPUT_STYLE} placeholder="e.g. +91 98765 43210" value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} />
                    </div>
                  </>
                )}

                {signupStep === 3 && (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Services offered (optional)</label>
                      <textarea disabled={loading} style={TEXTAREA_STYLE} placeholder="e.g. We offer residential plumbing, drain cleaning..." value={businessServices} onChange={(e) => setBusinessServices(e.target.value)} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Resource brochure / document link (optional)</label>
                      <input disabled={loading} style={INPUT_STYLE} placeholder="e.g. https://acme.com/brochure.pdf" value={docLink} onChange={(e) => setDocLink(e.target.value)} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Custom AI prompt / instructions (optional)</label>
                      <textarea disabled={loading} style={TEXTAREA_STYLE} placeholder="e.g. Speak politely. Always sign off with our name..." value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} />
                    </div>
                  </>
                )}
              </>
            )}

            {error && <p style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>{error}</p>}

            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              {mode === "signup" && signupStep > 1 && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setSignupStep((s) => s - 1)}
                  style={{
                    flex: 1,
                    padding: "11px 20px",
                    borderRadius: 10,
                    background: "var(--color-bg3)",
                    color: "var(--color-text2)",
                    fontSize: 13,
                    fontWeight: 700,
                    border: "1px solid var(--color-bg4)",
                    cursor: loading ? "not-allowed" : "pointer",
                    boxShadow: "none",
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  Back
                </button>
              )}
              <button
                type="submit"
                disabled={loading}
                style={{
                  flex: 2,
                  padding: "11px 20px",
                  borderRadius: 10,
                  background: loading ? "var(--color-bg4)" : "linear-gradient(135deg, #4f46e5, #6366f1)",
                  color: loading ? "var(--color-text3)" : "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                  boxShadow: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {loading ? (
                  <>
                    <svg
                      className="animate-spin"
                      style={{
                        width: 16,
                        height: 16,
                        color: "currentColor",
                      }}
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        style={{ opacity: 0.25 }}
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        style={{ opacity: 0.75 }}
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>{mode === "login" ? "Logging in..." : "Creating account..."}</span>
                  </>
                ) : (
                  mode === "login"
                    ? "Log in →"
                    : signupStep === 1
                      ? "Next: Business Details →"
                      : signupStep === 2
                        ? "Next: AI Setup →"
                        : "Create free account →"
                )}
              </button>
            </div>
          </form>

          {mode === "signup" ? (
            <div style={{ marginTop: 28, textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "var(--color-text3)", margin: "0 0 8px 0", lineHeight: 1.6 }}>
                Already registered your business profile?
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={() => { setMode("login"); setError(""); setSignupStep(1); }}
                style={{ background: "none", border: "none", cursor: loading ? "not-allowed" : "pointer", color: "#4f46e5", fontWeight: 700, padding: 0, fontSize: 13, opacity: loading ? 0.6 : 1 }}
              >
                Log in to your dashboard →
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 28, textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "var(--color-text3)", margin: "0 0 8px 0", lineHeight: 1.6 }}>
                New to SalesAgent? Join hundreds of businesses automating their cold outreach with AI.
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={() => { setMode("signup"); setError(""); setSignupStep(1); }}
                style={{ background: "none", border: "none", cursor: loading ? "not-allowed" : "pointer", color: "#4f46e5", fontWeight: 700, padding: 0, fontSize: 13, opacity: loading ? 0.6 : 1 }}
              >
                Create your free account →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          zIndex: 10,
          borderTop: "1px solid var(--color-bg4)",
          paddingTop: 16,
          fontSize: 12,
          color: "var(--color-text3)",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <p style={{ margin: 0 }}>
          © {new Date().getFullYear()} SalesAgent · AI-powered sales outreach
        </p>
        <div style={{ display: "flex", gap: 16 }}>
          <a href="#" style={{ color: "var(--color-text3)", textDecoration: "none" }}>Terms & Conditions</a>
          <a href="#" style={{ color: "var(--color-text3)", textDecoration: "none" }}>Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}
