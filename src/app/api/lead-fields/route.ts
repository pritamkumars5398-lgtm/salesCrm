import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { LeadField } from "@/lib/models/LeadField";
import { authorizeWorkspace } from "@/server/auth/access";
import { getFieldDefs } from "@/server/services/lead-groups.service";
import { LEAD_FIELD_TYPES, MAX_FIELDS_PER_WORKSPACE, toFieldKey, cleanOptions, LeadFieldType } from "@/lib/lead-fields";

const RESERVED_KEYS = new Set(["status", "tags", "email", "phone", "company", "name", "source", "location", "website"]);

/** GET ?agentId — the workspace's custom lead fields, in display order. */
export async function GET(req: Request) {
  await connectDB();
  const access = await authorizeWorkspace(req, new URL(req.url).searchParams.get("agentId"));
  if (!access.ok) return access.response;
  return NextResponse.json(await getFieldDefs(access.agentId));
}

/** POST { agentId, label, type, options?, aiFill?, description? } — add a field. */
export async function POST(req: Request) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const access = await authorizeWorkspace(req, body.agentId, { minRole: "admin" });
  if (!access.ok) return access.response;

  const label = String(body.label ?? "").trim().slice(0, 60);
  const type = body.type as LeadFieldType;
  if (!label) return NextResponse.json({ error: "Give the field a name." }, { status: 400 });
  if (!LEAD_FIELD_TYPES.some((t) => t.value === type)) return NextResponse.json({ error: "Pick a field type." }, { status: 400 });
  const key = toFieldKey(label);
  if (!key || /^\d/.test(key)) return NextResponse.json({ error: "Use letters in the field name." }, { status: 400 });
  if (RESERVED_KEYS.has(key)) return NextResponse.json({ error: `"${label}" is already a built-in lead field.` }, { status: 400 });

  const { options, error } = cleanOptions(type, body.options);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const count = await LeadField.countDocuments({ agentId: access.agentId });
  if (count >= MAX_FIELDS_PER_WORKSPACE) {
    return NextResponse.json({ error: `A workspace can have at most ${MAX_FIELDS_PER_WORKSPACE} custom fields.` }, { status: 400 });
  }
  try {
    const field = await LeadField.create({
      agentId: access.agentId, key, label, type, options,
      aiFill: !!body.aiFill, description: String(body.description ?? "").slice(0, 300), order: count,
    });
    return NextResponse.json(field, { status: 201 });
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 11000) {
      return NextResponse.json({ error: `A field called "${label}" already exists.` }, { status: 409 });
    }
    throw err;
  }
}
