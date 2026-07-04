import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * API routes that must stay reachable without a session cookie:
 * - auth: login/signup happen before a session exists
 * - webhooks + sms status: called by Twilio/Calendly/WhatsApp providers
 * - leads/[id]/response: interest buttons clicked from outreach emails
 * - crons/execute: external scheduler, protected by CRON_SECRET in the route
 */
const PUBLIC_API = [
  /^\/api\/auth\//,
  /^\/api\/webhooks\//,
  /^\/api\/sms\/status$/,
  /^\/api\/leads\/[^/]+\/response$/,
  /^\/api\/crons\/execute$/,
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthed = request.cookies.has("sa_auth");

  if (pathname.startsWith("/api/")) {
    if (PUBLIC_API.some((re) => re.test(pathname))) return NextResponse.next();
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (!isAuthed) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/(dashboard|leads|sequence|settings|crons|apify|profile)/:agentId*",
    "/api/:path*",
  ],
};
