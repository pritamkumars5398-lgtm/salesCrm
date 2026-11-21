import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { authorizeSuperadmin } from "@/server/auth/access";
import { listClients } from "@/server/services/admin.service";

/** GET — every client organization with plan, status, usage and setup (superadmin only). */
export async function GET(req: Request) {
  await connectDB();
  const auth = await authorizeSuperadmin(req);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ clients: await listClients() });
}
