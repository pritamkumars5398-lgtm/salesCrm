import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { authorizeWorkspace } from "@/server/auth/access";
import { allowanceForClient, getAssistantAllowance } from "@/server/services/assistant-usage.service";

/** GET ?agentId — AI assistant tokens used / left this month (left: null = unlimited). */
export async function GET(req: Request) {
  await connectDB();
  const access = await authorizeWorkspace(req, new URL(req.url).searchParams.get("agentId"));
  if (!access.ok) return access.response;
  return NextResponse.json(allowanceForClient(await getAssistantAllowance(access.agentId)));
}
