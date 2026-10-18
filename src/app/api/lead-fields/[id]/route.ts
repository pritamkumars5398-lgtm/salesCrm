import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { LeadField } from "@/lib/models/LeadField";
import { LeadGroup } from "@/lib/models/LeadGroup";
import { Lead } from "@/lib/models/Lead";
import { authorizeRecord } from "@/server/auth/access";
import { cleanOptions } from "@/lib/lead-fields";

async function load(req: Request, id: string) {
  const field = Types.ObjectId.isValid(id) ? await LeadField.findById(id) : null;
  return authorizeRecord(req, field, "Field not found", { minRole: "admin" });
}

/**
 * PUT { label?, options?, aiFill?, description?, order? }
 * The type and key can't change — existing values and group rules depend on them.
 * Removing a dropdown option clears it from leads that had it.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const access = await load(req, id);
  if (!access.ok) return access.response;
  const field = access.record;
  const body = await req.json().catch(() => ({}));

  if (body.type !== undefined && body.type !== field.type) {
    return NextResponse.json({ error: "A field's type can't be changed — create a new field instead." }, { status: 400 });
  }
  if (body.label !== undefined) {
    const label = String(body.label).trim().slice(0, 60);
    if (!label) return NextResponse.json({ error: "Give the field a name." }, { status: 400 });
    field.label = label;
  }
  let removedOptions: string[] = [];
  if (body.options !== undefined) {
    const { options, error } = cleanOptions(field.type, body.options);
    if (error) return NextResponse.json({ error }, { status: 400 });
    removedOptions = field.options.filter((o) => !options!.includes(o));
    field.options = options!;
  }
  if (body.aiFill !== undefined) field.aiFill = !!body.aiFill;
  if (body.description !== undefined) field.description = String(body.description).slice(0, 300);
  if (Number.isInteger(body.order)) field.order = body.order;
  await field.save();

  if (removedOptions.length) {
    const path = `customFields.${field.key}`;
    if (field.type === "select") {
      await Lead.updateMany({ agentId: field.agentId, [path]: { $in: removedOptions } }, { $unset: { [path]: "" } });
    } else {
      await Lead.updateMany({ agentId: field.agentId, [path]: { $in: removedOptions } }, { $pull: { [path]: { $in: removedOptions } } });
    }
  }
  return NextResponse.json(field);
}

/**
 * DELETE — removes the field and its values from every lead. Smart groups that
 * used it are reported back: their broken rule makes them match nothing until fixed.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const access = await load(req, id);
  if (!access.ok) return access.response;
  const field = access.record;

  await LeadField.deleteOne({ _id: field._id });
  await Lead.updateMany({ agentId: field.agentId }, { $unset: { [`customFields.${field.key}`]: "" } });
  const affected = await LeadGroup.find({ agentId: field.agentId, kind: "smart", "rules.field": `cf.${field.key}` })
    .select("name").lean();
  return NextResponse.json({ success: true, affectedGroups: affected.map((g) => g.name) });
}
