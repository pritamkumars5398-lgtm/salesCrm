import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { authorizeSuperadmin } from "@/server/auth/access";
import { checkIntegrations } from "@/server/services/integration-status.service";

/** GET — the platform's own .env keys (used by organizations on platform credentials). */
export async function GET(req: Request) {
  await connectDB();
  const auth = await authorizeSuperadmin(req);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ checkedAt: new Date().toISOString(), integrations: await checkIntegrations(null) });
}
