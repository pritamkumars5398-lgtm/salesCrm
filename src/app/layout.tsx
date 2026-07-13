import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import Providers from "./providers";
import AppShell from "@/components/layout/AppShell";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: {
    template: "%s | SalesAgent",
    default: "SalesAgent — AI-Powered Sales Outreach",
  },
  description:
    "Automate your outbound sales across Email, WhatsApp, SMS, and Voice with AI. SalesAgent builds personalized campaigns, tracks replies, and books meetings — 24/7.",
  keywords: [
    "AI sales automation",
    "sales outreach",
    "CRM",
    "WhatsApp outreach",
    "email automation",
    "lead management",
  ],
  authors: [{ name: "SalesAgent" }],
  creator: "SalesAgent",
  openGraph: {
    type: "website",
    locale: "en_US",
    title: "SalesAgent — AI-Powered Sales Outreach",
    description:
      "Automate your outbound sales across Email, WhatsApp, SMS, and Voice with AI.",
    siteName: "SalesAgent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfc" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before first paint — no white flash for dark users. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
      </head>
      <body style={{ margin: 0 }}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-ZZFXVLNE3V"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', 'G-ZZFXVLNE3V');
          `}
        </Script>
      </body>
    </html>
  );
}

