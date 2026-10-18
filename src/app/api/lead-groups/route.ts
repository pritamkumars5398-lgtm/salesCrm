import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { LeadGroup, ILeadGroup } from "@/lib/models/LeadGroup";
import { authorizeWorkspace } from "@/server/auth/access";
import { brokenRules, countGroupMembers, getFieldDefs } from "@/server/services/lead-groups.service";
import { cleanGroupInput } from "@/server/services/group-input";
import { MAX_GROUPS_PER_WORKSPACE } from "@/lib/lead-fields";

/** GET ?agentId — groups with live member counts and any rule problems. */
export async function GET(req: Request) {
  await connectDB();
  const access = await authorizeWorkspace(req, new URL(req.url).searchParams.get("agentId"));
  if (!access.ok) return access.response;
  const [groups, defs] = await Promise.all([
    LeadGroup.find({ agentId: access.agentId }).sort({ createdAt: 1 }).lean<ILeadGroup[]>(),
    getFieldDefs(access.agentId),
  ]);
  const counts = await countGroupMembers(access.agentId, groups, defs);
  return NextResponse.json(groups.map((g) => ({
    ...g,
    memberCount: counts[String(g._id)] ?? 0,
    problems: brokenRules(g, defs),
  })));
}

/** POST { agentId, name, kind, color?, match?, rules?, playbook? } */
export async function POST(req: Request) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const access = await authorizeWorkspace(req, body.agentId, { minRole: "admin" });
  if (!access.ok) return access.response;

  if ((await LeadGroup.countDocuments({ agentId: access.agentId })) >= MAX_GROUPS_PER_WORKSPACE) {
    return NextResponse.json({ error: `A workspace can have at most ${MAX_GROUPS_PER_WORKSPACE} groups.` }, { status: 400 });
  }
  const input = cleanGroupInput(body, await getFieldDefs(access.agentId), null);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
  try {
    const group = await LeadGroup.create({ ...input.value, agentId: access.agentId });
    return NextResponse.json(group, { status: 201 });
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 11000) {
      return NextResponse.json({ error: `A group called "${input.value.name}" already exists.` }, { status: 409 });
    }
    throw err;
  }
}
