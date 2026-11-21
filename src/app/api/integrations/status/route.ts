import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { authorizeWorkspace, deny } from "@/server/auth/access";
import { checkIntegrations } from "@/server/services/integration-status.service";

/** GET ?agentId — live health, balance and usage of every service this workspace uses (admins). */
export async function GET(req: Request) {
  await connectDB();
  const access = await authorizeWorkspace(req, new URL(req.url).searchParams.get("agentId"), { minRole: "admin" });
  if (!access.ok) return access.response;
  if (!access.user.isSuperadmin) return deny(403, "Your admin sets this up for you.").response;
  return NextResponse.json({ checkedAt: new Date().toISOString(), integrations: await checkIntegrations(access.agentId) });
}
