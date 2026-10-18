"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import AuthModal from "@/components/ui/AuthModal";
import { hasServerSession } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAppStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hasServerSession().then((signedIn) => {
      if (signedIn) router.replace("/dashboard/default");
      else setReady(true);
    });
  }, [router]);

  if (!ready) return null;

  return (
    <AuthModal
      mode="login"
      onClose={() => router.push("/")}
      onAuth={(name, email) => {
        login(name, email);
        router.push("/dashboard/default");
      }}
    />
  );
}
