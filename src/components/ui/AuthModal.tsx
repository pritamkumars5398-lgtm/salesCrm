"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { IconArrowLeft, IconEye, IconEyeOff, IconCheck, IconSparkles } from "@tabler/icons-react";
import { authLogin, authSignup, requestAccess } from "@/lib/auth";
import Button from "@/components/ui/Button";
import { HandNote } from "@/components/ui/HandDrawn";

interface Props {
  mode: "login" | "signup";
  onClose: () => void;
  onAuth: (name: string, email: string) => void;
}

export default function AuthModal({ mode: initialMode, onClose, onAuth }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Sync step param from URL (?step=1|2|3)
  const stepParam = searchParams?.get("step");
  const parsedStep = stepParam ? parseInt(stepParam, 10) : 1;
  const initialStep = !isNaN(parsedStep) && parsedStep >= 1 && parsedStep <= 3 ? parsedStep : 1;

  // Request Access / Onboarding Wizard steps
  const [signupStep, setSignupStep] = useState(initialStep);
  const [businessName, setBusinessName] = useState("");
  const [businessWebsite, setBusinessWebsite] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessServices, setBusinessServices] = useState("");
  const [docLink, setDocLink] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  // Keep mode in sync with props/path
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // Keep signup step in sync with URL search param
  useEffect(() => {
    if (stepParam) {
      const s = parseInt(stepParam, 10);
      if (!isNaN(s) && s >= 1 && s <= 3) {
        setSignupStep(s);
      }
    }
  }, [stepParam]);

  const changeStep = (nextStep: number) => {
    const clamped = Math.max(1, Math.min(3, nextStep));
    setSignupStep(clamped);
    setError("");
    const targetBase = pathname?.includes("request") ? pathname : "/request-access";
    router.replace(`${targetBase}?step=${clamped}`, { scroll: false });
  };

  const handleSwitchToLogin = () => {
    setMode("login");
    setError("");
    router.push("/login");
  };

  const handleSwitchToRequestAccess = (step = 1) => {
    setMode("signup");
    setError("");
    setSignupStep(step);
    router.push(`/request-access?step=${step}`);
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

    // Request Access / Onboarding flow (Admin configured model)
    if (signupStep === 1) {
      if (!name || !email) { setError("Name and Email are required."); return; }
      changeStep(2);
    } else if (signupStep === 2) {
      if (!businessName) { setError("Please specify your Business Name."); return; }
      changeStep(3);
    } else if (signupStep === 3) {
      setLoading(true);
      try {
        /*
        // COMMENTED: Previous self-service registration (direct account creation)
        // const result = await authSignup(name, email, password);
        // if (result.error) { setError(result.error); return; }
        // onAuth(name.trim(), email);
        */

        const result = await requestAccess({
          name: name.trim(),
          email: email.trim(),
          phone: businessPhone.trim(),
          businessName: businessName.trim(),
          businessWebsite: businessWebsite.trim(),
          businessServices: businessServices.trim(),
          docLink: docLink.trim(),
          customPrompt: customPrompt.trim(),
        });

        if (result.error) {
          setError(result.error);
          return;
        }

        setRequestSubmitted(true);
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
      {/* Perspective floor grid */}
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
            left: "-25%",
            right: "-25%",
            bottom: 0,
            height: "60%",
            backgroundImage: `
              linear-gradient(rgba(223,42,42,0.14) 1px, transparent 1px),
              linear-gradient(90deg, rgba(223,42,42,0.14) 1px, transparent 1px)
            `,
            backgroundSize: "48px 48px",
            transform: "rotateX(72deg)",
            transformOrigin: "bottom",
            maskImage: "linear-gradient(to top, black 15%, transparent 85%)",
            WebkitMaskImage: "linear-gradient(to top, black 15%, transparent 85%)",
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
          opacity: 0.03,
          mixBlendMode: "overlay",
          pointerEvents: "none",
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      {/* Glow */}
      <div
        aria-hidden
        className="animate-float"
        style={{
          position: "absolute",
          top: "10%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 700,
          height: 400,
          zIndex: 0,
          background: "radial-gradient(ellipse at center, rgba(223,42,42,0.14) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

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
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#df2a2a" }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text)" }}>
            Sales<span style={{ color: "#df2a2a" }}>Agent</span>
          </span>
        </div>
      </div>

      {/* Center content */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1, zIndex: 1, margin: "40px 0" }}>
        <div
          key={`${mode}-${signupStep}`}
          className="relative w-full animate-slide-up"
          style={{
            maxWidth: 440,
            background: "transparent",
            borderRadius: 24,
            padding: "0 20px",
            zIndex: 1,
            boxSizing: "border-box",
          }}
        >
          <HandNote
            label={mode === "login" ? "Welcome back!" : "Enterprise Setup"}
            rotate={-8}
            style={{ top: -6, left: "calc(100% + 20px)" }}
          />

          {requestSubmitted ? (
            <div className="flex flex-col items-center text-center py-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)" }}>
                <IconCheck size={32} className="text-green-500" />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 10px 0", color: "var(--color-text)" }}>
                Setup Request Received!
              </h2>
              <p style={{ fontSize: 13.5, color: "var(--color-text2)", margin: "0 0 16px 0", lineHeight: 1.6 }}>
                Thank you, <strong className="text-text">{name || "there"}</strong>! Our management team will contact you shortly to review your business requirements, configure your dedicated AI voice persona & outreach integrations, and provide your credentials.
              </p>
              <div className="p-3.5 rounded-xl border border-bg4 bg-bg3 text-left w-full mb-6">
                <p className="text-[12px] text-text3 mb-1">Registered Contact Email:</p>
                <p className="text-[13px] font-semibold text-text truncate">{email}</p>
                {businessPhone && (
                  <>
                    <p className="text-[12px] text-text3 mt-2 mb-1">Contact Phone:</p>
                    <p className="text-[13px] font-semibold text-text">{businessPhone}</p>
                  </>
                )}
              </div>
              <Button
                variant="primary"
                size="lg"
                style={{ width: "100%" }}
                onClick={() => {
                  setRequestSubmitted(false);
                  handleSwitchToLogin();
                }}
              >
                Return to Login
              </Button>
            </div>
          ) : (
            <>
              {mode === "login" ? (
                <div style={{ marginBottom: 24 }}>
                  <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px 0", color: "var(--color-text)" }}>Log in to your account</h2>
                  <p style={{ fontSize: 13, color: "var(--color-text3)", margin: 0, lineHeight: 1.5 }}>Welcome back! Enter your email and password to access the sales platform.</p>
                </div>
              ) : (
                <div style={{ marginBottom: 24 }}>
                  <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px 0", color: "var(--color-text)" }}>
                    {signupStep === 1 ? "Request Workspace Setup" : signupStep === 2 ? "Tell us about your business" : "Personalize your AI assistant"}
                  </h2>
                  <p style={{ fontSize: 13, color: "var(--color-text3)", margin: 0, lineHeight: 1.5 }}>
                    {signupStep === 1
                      ? "Submit your details. Our admin team will talk with you and configure your dedicated AI sales platform."
                      : signupStep === 2
                        ? "We use your website, services, and phone number to configure your agent brain and integrations."
                        : "Share any brochures, target markets or custom rules for your dedicated AI assistant."}
                  </p>
                </div>
              )}

          {mode === "signup" && (
            <div className="flex items-center justify-between mb-4">
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text3)", textTransform: "uppercase" }}>
                Step {signupStep} of 3
              </span>
              <div style={{ display: "flex", gap: 6, width: "60%" }}>
                {[1, 2, 3].map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      // Allow navigating directly to current or visited steps
                      if (s <= signupStep) changeStep(s);
                    }}
                    title={`Go to Step ${s}`}
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 2,
                      background: signupStep >= s ? "#df2a2a" : "var(--color-bg4)",
                      border: "none",
                      padding: 0,
                      cursor: s <= signupStep ? "pointer" : "default",
                      transition: "background 0.2s ease",
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleAction} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {mode === "login" ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Email address</label>
                  <input disabled={loading} className="form-input" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Password</label>
                  <div style={{ position: "relative", width: "100%" }}>
                    <input
                      disabled={loading}
                      className="form-input" style={{ paddingRight: 40 }}
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
                      <input disabled={loading} className="form-input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Work email address</label>
                      <input disabled={loading} className="form-input" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Phone number</label>
                      <input disabled={loading} className="form-input" placeholder="+91 98765 43210" value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} />
                    </div>
                    {/*
                    // COMMENTED: Password input for self-service signup (Admin now provisions login credentials after consultation)
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Password</label>
                      <input disabled={loading} className="form-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    */}
                  </>
                )}

                {signupStep === 2 && (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Business name</label>
                      <input disabled={loading} className="form-input" placeholder="e.g. Acme Inc" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Business website (optional)</label>
                      <input disabled={loading} className="form-input" placeholder="e.g. https://acme.com" value={businessWebsite} onChange={(e) => setBusinessWebsite(e.target.value)} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Business phone number (optional)</label>
                      <input disabled={loading} className="form-input" placeholder="e.g. +91 98765 43210" value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} />
                    </div>
                  </>
                )}

                {signupStep === 3 && (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Services offered (optional)</label>
                      <textarea disabled={loading} className="form-input" placeholder="e.g. We offer residential plumbing, drain cleaning..." value={businessServices} onChange={(e) => setBusinessServices(e.target.value)} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Resource brochure / document link (optional)</label>
                      <input disabled={loading} className="form-input" placeholder="e.g. https://acme.com/brochure.pdf" value={docLink} onChange={(e) => setDocLink(e.target.value)} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Custom AI prompt / instructions (optional)</label>
                      <textarea disabled={loading} className="form-input" placeholder="e.g. Speak politely. Always sign off with our name..." value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} />
                    </div>
                  </>
                )}
              </>
            )}

            {error && <p style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>{error}</p>}

            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              {mode === "signup" && signupStep > 1 && (
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  disabled={loading}
                  style={{ flex: 1 }}
                  onClick={() => changeStep(signupStep - 1)}
                >
                  Back
                </Button>
              )}
              <Button type="submit" variant="primary" size="lg" loading={loading} style={{ flex: 2 }}>
                {loading
                  ? mode === "login"
                    ? "Logging in..."
                    : "Submitting request..."
                  : mode === "login"
                    ? "Log in →"
                    : signupStep === 1
                      ? "Next: Business Details →"
                      : signupStep === 2
                        ? "Next: Requirements →"
                        : "Submit Setup Request →"}
              </Button>
            </div>
          </form>

          {mode === "signup" ? (
            <div style={{ marginTop: 28, textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "var(--color-text3)", margin: "0 0 8px 0", lineHeight: 1.6 }}>
                Already have an account configured by admin?
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={handleSwitchToLogin}
                style={{ background: "none", border: "none", cursor: loading ? "not-allowed" : "pointer", color: "#df2a2a", fontWeight: 700, padding: 0, fontSize: 13, opacity: loading ? 0.6 : 1 }}
              >
                Log in to your dashboard →
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 28, textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "var(--color-text3)", margin: "0 0 8px 0", lineHeight: 1.6 }}>
                Need a dedicated AI sales agent configured for your business?
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleSwitchToRequestAccess(1)}
                style={{ background: "none", border: "none", cursor: loading ? "not-allowed" : "pointer", color: "#df2a2a", fontWeight: 700, padding: 0, fontSize: 13, opacity: loading ? 0.6 : 1 }}
              >
                Request Workspace Setup →
              </button>
            </div>
          )}
        </>
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
