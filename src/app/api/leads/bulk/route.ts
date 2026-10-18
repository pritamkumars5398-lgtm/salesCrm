import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { authorizeWorkspace } from "@/server/auth/access";
import { cleanGroupIds, cleanTags } from "@/server/services/lead-attributes.service";
import { MAX_TAGS_PER_LEAD } from "@/lib/lead-fields";

const MAX_IDS = 2000;

/**
 * POST /api/leads/bulk — tag / group many leads at once.
 * Body: { agentId, ids, addTags?, removeTags?, addGroupIds?, removeGroupIds? }
 */
export async function POST(req: Request) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const access = await authorizeWorkspace(req, body.agentId);
  if (!access.ok) return access.response;

  const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
  if (ids.length === 0 || ids.length > MAX_IDS || ids.some((id) => !Types.ObjectId.isValid(id))) {
    return NextResponse.json({ error: `Select between 1 and ${MAX_IDS} leads.` }, { status: 400 });
  }

  const lists: Record<string, string[] | Types.ObjectId[]> = {};
  for (const key of ["addTags", "removeTags"] as const) {
    if (body[key] === undefined) continue;
    const r = cleanTags(body[key]);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    lists[key] = r.value;
  }
  for (const key of ["addGroupIds", "removeGroupIds"] as const) {
    if (body[key] === undefined) continue;
    const r = await cleanGroupIds(access.agentId, body[key]);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    lists[key] = r.value;
  }
  if (Object.values(lists).every((l) => l.length === 0)) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  // Only this workspace's leads, whatever ids were sent.
  const scope = { _id: { $in: ids.map((id) => new Types.ObjectId(id)) }, agentId: access.agent._id };
  const update: Record<string, unknown> = {};
  if (lists.addTags?.length) update.$addToSet = { ...(update.$addToSet as object), tags: { $each: lists.addTags } };
  if (lists.addGroupIds?.length) update.$addToSet = { ...(update.$addToSet as object), groupIds: { $each: lists.addGroupIds } };
  // $addToSet and $pull can't touch the same path in one update, so pulls run separately.
  const pull: Record<string, unknown> = {};
  if (lists.removeTags?.length) pull.tags = { $in: lists.removeTags };
  if (lists.removeGroupIds?.length) pull.groupIds = { $in: lists.removeGroupIds };

  let modified = 0;
  if (Object.keys(update).length) modified += (await Lead.updateMany(scope, update)).modifiedCount;
  if (Object.keys(pull).length) modified += (await Lead.updateMany(scope, { $pull: pull })).modifiedCount;

  if (lists.addTags?.length) {
    // Trim anything that went over the per-lead cap.
    await Lead.updateMany(
      { ...scope, [`tags.${MAX_TAGS_PER_LEAD}`]: { $exists: true } },
      { $push: { tags: { $each: [], $slice: MAX_TAGS_PER_LEAD } } },
    );
  }
  return NextResponse.json({ ok: true, modified });
}
