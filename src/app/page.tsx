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

  if (!ready && !authed) {
    return null; // wait for localStorage check before rendering anything
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
