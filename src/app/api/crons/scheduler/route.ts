import { NextResponse } from "next/server";
import { authorizeUser } from "@/server/auth/access";

/** GET — is anything triggering schedules? (server.js calls /api/crons/execute every minute) */
export async function GET(req: Request) {
  const auth = await authorizeUser(req);
  if (!auth.ok) return auth.response;
  const last = globalThis.__schedulerLastTick ?? null;
  return NextResponse.json({
    lastTickAt: last ? new Date(last).toISOString() : null,
    // A tick is expected every 60s; allow for a slow run.
    alive: !!last && Date.now() - last < 3 * 60 * 1000,
  });
}
