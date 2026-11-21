import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { authorizeWorkspace } from "@/server/auth/access";
import { getChannelStatus } from "@/server/services/channel-status.service";

/** GET ?agentId[&fresh=1] — customer-safe status of every channel (no providers, models or keys). */
export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const access = await authorizeWorkspace(req, searchParams.get("agentId"));
  if (!access.ok) return access.response;
  const channels = await getChannelStatus(access.agentId, { fresh: searchParams.get("fresh") === "1" });
  return NextResponse.json({ checkedAt: new Date().toISOString(), channels });
}
