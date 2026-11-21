"use client";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/*
// COMMENTED: Previous direct signup route (migrated to /request-access)
// import { useState } from "react";
// import { useAppStore } from "@/store/useAppStore";
// import AuthModal from "@/components/ui/AuthModal";
// import { hasServerSession } from "@/lib/auth";
//
// export default function SignupPage() {
//   const router = useRouter();
//   const { login } = useAppStore();
//   const [ready, setReady] = useState(false);
//
//   useEffect(() => {
//     hasServerSession().then((signedIn) => {
//       if (signedIn) router.replace("/dashboard/default");
//       else setReady(true);
//     });
//   }, [router]);
//
//   if (!ready) return null;
//
//   return (
//     <AuthModal
//       mode="signup"
//       onClose={() => router.push("/")}
//       onAuth={(name, email) => {
//         login(name, email);
//         router.push("/dashboard/default");
//       }}
//     />
//   );
// }
*/

function SignupRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams?.toString();
    router.replace(`/request-access${qs ? `?${qs}` : ""}`);
  }, [router, searchParams]);

  return null;
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupRedirect />
    </Suspense>
  );
}
