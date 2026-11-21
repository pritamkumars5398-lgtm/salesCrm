import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { authorizeSuperadmin } from "@/server/auth/access";
import { getClient, updateClient, type ClientUpdate } from "@/server/services/admin.service";

/** GET — one client in full (superadmin only). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const auth = await authorizeSuperadmin(req);
  if (!auth.ok) return auth.response;
  const client = await getClient((await params).id);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  return NextResponse.json(client);
}

/** PATCH — change plan, expiry, limits / feature switches, platform keys, free credits (superadmin only). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const auth = await authorizeSuperadmin(req);
  if (!auth.ok) return auth.response;
  const body = (await req.json().catch(() => ({}))) as ClientUpdate;
  try {
    const client = await updateClient((await params).id, body);
    return NextResponse.json(client);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't save." }, { status: 400 });
  }
}
