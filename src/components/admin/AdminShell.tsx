"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { IconLayoutDashboard, IconBuildingStore, IconKey, IconReceipt, IconArrowLeft, IconShield, IconLogout } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import ToastContainer from "@/components/ui/Toast";

const MENU = [
  { href: "/admin", label: "Overview", Icon: IconLayoutDashboard },
  { href: "/admin/clients", label: "Clients", Icon: IconBuildingStore },
  { href: "/admin/platform", label: "Platform keys", Icon: IconKey },
  { href: "/admin/payments", label: "Payments", Icon: IconReceipt },
];

/** The superadmin panel's own frame — separate from the customer app's sidebar and top bar. */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { setIsSuperadmin, logout } = useAppStore();
  const [me, setMe] = useState<{ name: string; email: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (!d?.user?.isSuperadmin) { router.replace("/"); return; }
        setIsSuperadmin(true);
        setMe({ name: d.user.name, email: d.user.email });
      })
      .catch(() => !cancelled && router.replace("/"));
    return () => { cancelled = true; };
  }, [router, setIsSuperadmin]);

  if (!me) {
    return <div className="flex h-screen items-center justify-center bg-bg text-[13px] text-text3">Loading admin panel…</div>;
  }

  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <aside className="hidden md:flex flex-col shrink-0 border-r border-bg4" style={{ width: 230, background: "var(--color-bg2)" }}>
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-bg4">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}><IconShield size={18} /></span>
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-text m-0">Admin panel</p>
            <p className="text-[11px] text-text3 m-0 truncate">{me.email}</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1 p-3 flex-1">
          {MENU.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold no-underline"
              style={{ background: isActive(href) ? "rgba(245,158,11,0.12)" : "transparent", color: isActive(href) ? "#f59e0b" : "var(--color-text2)" }}
            >
              <Icon size={16} /> {label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-bg4 flex flex-col gap-1">
          <Link href="/dashboard/default" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold no-underline text-text2 hover:bg-bg3">
            <IconArrowLeft size={16} /> Back to app
          </Link>
          <button type="button" onClick={() => { logout(); fetch("/api/auth/logout", { method: "POST" }).finally(() => router.replace("/")); }} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold text-text3 bg-transparent border-none cursor-pointer text-left hover:bg-bg3">
            <IconLogout size={16} /> Log out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* small screens: top menu */}
        <div className="md:hidden flex items-center gap-1 overflow-x-auto px-3 py-2 border-b border-bg4" style={{ background: "var(--color-bg2)" }}>
          {MENU.map(({ href, label }) => (
            <Link key={href} href={href} className="shrink-0 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold no-underline" style={{ background: isActive(href) ? "rgba(245,158,11,0.12)" : "transparent", color: isActive(href) ? "#f59e0b" : "var(--color-text2)" }}>{label}</Link>
          ))}
          <Link href="/dashboard/default" className="shrink-0 px-3 py-1.5 text-[12.5px] text-text3 no-underline">← App</Link>
        </div>
        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">{children}</div>
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}
