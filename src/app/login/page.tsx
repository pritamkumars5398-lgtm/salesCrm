"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import AuthModal from "@/components/ui/AuthModal";
import { hasServerSession, homePath } from "@/lib/auth";

function LoginContent() {
  const router = useRouter();
  const { login } = useAppStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hasServerSession().then((signedIn) => {
      if (signedIn) homePath().then((p) => router.replace(p));
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
        homePath().then((p) => router.push(p));
      }}
    />
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
