import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/**
 * API routes that must stay reachable without a session cookie:
 * - auth: login/signup happen before a session exists (each route checks itself)
 * - webhooks: called by Twilio/Calendly/WhatsApp providers
 * - calls: Plivo callbacks, guarded by a per-call token
 * - leads/[id]/response: interest buttons clicked from outreach emails
 * - crons/execute: external scheduler, protected by CRON_SECRET in the route
 *
 * Middleware only proves the cookie is genuine and unexpired; each route
 * still checks that the user may access the workspace it touches.
 */
const PUBLIC_API = [
  /^\/api\/auth\//,
  /^\/api\/webhooks\//,
  /^\/api\/calls\//,
  /^\/api\/leads\/[^/]+\/response$/,
  /^\/api\/crons\/execute$/,
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/") && PUBLIC_API.some((re) => re.test(pathname))) {
    return NextResponse.next();
  }

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/api/")) {
    if (!session) return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });
    return NextResponse.next();
  }

  if (!session) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/(dashboard|leads|sequence|crm|calendar|activity|settings|crons|profile|plans|superadmin|voice|inbox|voice-inbox|apify)/:path*",
    "/api/:path*",
  ],
};
