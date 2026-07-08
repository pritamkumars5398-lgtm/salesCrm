import type { Metadata } from "next";
import "./globals.css";

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
  themeColor: "#4f46e5",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
  openGraph: {
    type: "website",
    locale: "en_US",
    title: "SalesAgent — AI-Powered Sales Outreach",
    description:
      "Automate your outbound sales across Email, WhatsApp, SMS, and Voice with AI.",
    siteName: "SalesAgent",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
