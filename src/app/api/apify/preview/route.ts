import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { authorizeWorkspace } from "@/server/auth/access";
import { getSyncPreview, syncPreviewForCustomer } from "@/server/services/sync-preview.service";
import { parseSyncTarget } from "@/server/services/apify.service";

// ─── GET — what "Sync Sources" would do; starts nothing ──────────────────────
export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const access = await authorizeWorkspace(req, searchParams.get("agentId"));
  if (!access.ok) return access.response;
  const target = parseSyncTarget({ keyword: searchParams.get("keyword"), locations: searchParams.get("locations") ?? undefined, total: searchParams.get("total") });
  const preview = await getSyncPreview(access.agentId, target);
  // Customers see plain words; provider, model and actor names are for the platform admin.
  return NextResponse.json(access.user.isSuperadmin ? preview : syncPreviewForCustomer(preview));
}
