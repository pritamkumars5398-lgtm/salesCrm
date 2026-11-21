"use client";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function RequestSetupRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams?.toString();
    router.replace(`/request-access${qs ? `?${qs}` : ""}`);
  }, [router, searchParams]);

  return null;
}

export default function RequestSetupPage() {
  return (
    <Suspense fallback={null}>
      <RequestSetupRedirect />
    </Suspense>
  );
}
