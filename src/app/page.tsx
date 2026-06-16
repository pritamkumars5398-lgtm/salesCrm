"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import Landing from "@/components/pages/Landing";
import ToastContainer from "@/components/ui/Toast";

// Intercept fetch calls on the frontend to log API calls
if (typeof window !== "undefined" && !(window as any).__fetch_intercepted__) {
  (window as any).__fetch_intercepted__ = true;
  const originalFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const url = input.toString();
    const method = init?.method || "GET";
    const startTime = performance.now();

    console.log(
      `%c[API Request] %c${method} %c${url}`,
      "color: #6366f1; font-weight: bold;",
      "color: #3b82f6; font-weight: bold;",
      "color: #94a3b8;"
    );

    if (init?.body) {
      try {
        console.log("[API Request Body]", JSON.parse(init.body.toString()));
      } catch {
        console.log("[API Request Body]", init.body);
      }
    }

    try {
      const response = await originalFetch(input, init);
      const duration = (performance.now() - startTime).toFixed(1);
      const statusColor = response.ok ? "color: #10b981; font-weight: bold;" : "color: #ef4444; font-weight: bold;";
      
      console.log(
        `%c[API Response] %c${method} %c${url} %c${response.status} (${duration}ms)`,
        "color: #6366f1; font-weight: bold;",
        "color: #3b82f6; font-weight: bold;",
        "color: #94a3b8;",
        statusColor
      );

      const clone = response.clone();
      clone.json()
        .then((data) => {
          console.log("[API Response Data]", data);
        })
        .catch(() => {});

      return response;
    } catch (error) {
      console.error(
        `%c[API Request Failed] %c${method} %c${url}`,
        "color: #ef4444; font-weight: bold;",
        "color: #3b82f6; font-weight: bold;",
        "color: #ef4444;",
        error
      );
      throw error;
    }
  };
}

export default function Home() {
  const router = useRouter();
  const { isAuthed, login, setAgents, showToast } = useAppStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Restore or seed auth
    const stored = localStorage.getItem("sa_user");
    if (stored) {
      const user = JSON.parse(stored);
      login(user.name, user.email);
    } else {
      const demo = { name: "hello", email: "hello@gmail.com" };
      localStorage.setItem("sa_user", JSON.stringify(demo));
      login(demo.name, demo.email);
    }
    setMounted(true);
  }, [login]);

  useEffect(() => {
    if (!mounted || !isAuthed) return;

    fetch("/api/agents")
      .then((r) => r.json())
      .then(async (agentsList) => {
        let finalAgents = agentsList;
        if (agentsList.length === 0) {
          const a = await fetch("/api/agents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Carpenter Agent" }),
          }).then((r) => r.json());

          // Seed settings + demo leads
          await Promise.all([
            fetch("/api/settings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                agentId: a._id,
                settings: {
                  businessType:      "Other",
                  industry:          "carpenter",
                  gmKeyword:         "carpenter",
                  gmLocation:        "Lucknow",
                  gmMaxResults:      "25",
                  gmActorId:         "nwua9Gu5YrADL7ZD",
                  activeScraperType: "google-maps",
                  "google-mapsEnabled": "true",
                  leadLocation:      "Lucknow",
                  targetCompanySize: "Any",
                  apifyToken:        process.env.NEXT_PUBLIC_APIFY_TOKEN || "",
                  apifyScraper:      "Google Maps businesses",
                  apifyActorId:      "nwua9Gu5YrADL7ZD",
                  llmProvider:       "Claude (Anthropic)",
                  whatsappEnabled:   "true",
                  emailEnabled:      "true",
                  smsEnabled:        "true",
                  voiceEnabled:      "true",
                },
              }),
            }),
            fetch("/api/seed", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agentId: a._id }),
            }),
          ]);
          finalAgents = [{ ...a, leadCount: 10 }];
        }

        setAgents(finalAgents);
        
        // Redirect to dashboard with active agent ID
        if (finalAgents.length > 0) {
          router.replace(`/dashboard/${finalAgents[0]._id}`);
        }
      })
      .catch(() => showToast("Could not connect to database", "error"));
  }, [mounted, isAuthed, setAgents, router, showToast]);

  if (!mounted) {
    return (
      <div
        className="flex h-screen items-center justify-center bg-slate-950 text-slate-100"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-500 animate-ping opacity-75" />
          <div className="text-sm font-semibold tracking-wide text-slate-400">Loading SalesAgent...</div>
        </div>
      </div>
    );
  }

  if (!isAuthed) {
    return (
      <>
        <div className="h-screen overflow-y-auto">
          <Landing onAuth={(name, email) => login(name, email)} />
        </div>
        <ToastContainer />
      </>
    );
  }

  return (
    <div
      className="flex h-screen items-center justify-center bg-slate-950 text-slate-100"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-indigo-500 animate-ping opacity-75" />
        <div className="text-sm font-semibold tracking-wide text-slate-400">Redirecting to Dashboard...</div>
      </div>
    </div>
  );
}
