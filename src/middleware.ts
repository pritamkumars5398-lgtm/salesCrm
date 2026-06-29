import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const isAuthed = request.cookies.has("sa_auth");
  if (!isAuthed) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/(dashboard|leads|sequence|settings|crons|apify|profile)/:agentId*"],
};
