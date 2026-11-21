import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { authorizeSuperadmin } from "@/server/auth/access";
import { listPayments } from "@/server/services/admin.service";

/** GET — all plan and top-up payments across clients (superadmin only). */
export async function GET(req: Request) {
  await connectDB();
  const auth = await authorizeSuperadmin(req);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ payments: await listPayments() });
}
