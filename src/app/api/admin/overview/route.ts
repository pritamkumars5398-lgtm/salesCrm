import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { authorizeSuperadmin } from "@/server/auth/access";
import { platformOverview } from "@/server/services/admin.service";

/** GET — platform totals for the admin panel (superadmin only). */
export async function GET(req: Request) {
  await connectDB();
  const auth = await authorizeSuperadmin(req);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await platformOverview());
}
