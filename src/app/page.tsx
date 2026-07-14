"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import Landing from "@/components/pages/Landing";
import ToastContainer from "@/components/ui/Toast";

export default function Root() {
  const router = useRouter();
  const { login } = useAppStore();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sa_user");
    if (stored) {
      try {
        const user = JSON.parse(stored);
        login(user.name, user.email);
        setAuthed(true);
        router.replace("/dashboard/default");
        return;
      } catch {
        localStorage.removeItem("sa_user");
      }
    }
    setReady(true); // not logged in — show landing
  }, []);

  // Show a loader while the localStorage check runs, and keep it up while the
  // redirect to the dashboard is in flight — otherwise Landing flashes first.
  if (!ready || authed) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-bg">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          className="animate-spin text-primary-light"
          aria-hidden
        >
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
          <path d="M12 2 a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <p className="text-sm text-text3">Loading your dashboard…</p>
      </div>
    );
  }

  return (
    <>
      <div className="h-screen overflow-y-auto">
        <Landing
          onAuth={(name, email) => {
            login(name, email);
            router.push("/dashboard/default");
          }}
        />
      </div>
      <ToastContainer />
    </>
  );
}
