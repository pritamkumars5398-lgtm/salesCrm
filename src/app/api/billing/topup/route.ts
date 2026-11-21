import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { findPack, FEATURE_LABEL } from "@/lib/topups";
import { authorizeWorkspace } from "@/server/auth/access";
import { BillingError, applyFakeTopUp, createTopUpOrder, isFakePayment } from "@/server/services/billing.service";

/** POST { agentId, packId } — buy a top-up pack (organization owner only). Credits never expire. */
export async function POST(req: Request) {
  try {
    await connectDB();
    const body = await req.json().catch(() => ({}));
    const access = await authorizeWorkspace(req, body.agentId, { minRole: "owner" });
    if (!access.ok) return access.response;
    if (!access.organizationId) return NextResponse.json({ error: "Log out and back in once, then try again." }, { status: 409 });
    const pack = findPack(String(body.packId ?? ""));
    if (!pack) return NextResponse.json({ error: "Pick a top-up pack." }, { status: 400 });
    const label = `${pack.units.toLocaleString("en-IN")} extra ${FEATURE_LABEL[pack.field].unit}`;

    if (isFakePayment()) {
      await applyFakeTopUp(access.organizationId, access.user._id, pack.id);
      return NextResponse.json({ fake: true, topUpField: pack.field, topUpUnits: pack.units, message: `${label} added (Fake Payment Mode).` });
    }

    const order = await createTopUpOrder(access.organizationId, access.user._id, pack.id);
    return NextResponse.json({
      ...order,
      name: "SalesAgent",
      description: `Top-up — ${label}`,
      prefill: { name: access.user.name, email: access.user.email },
    });
  } catch (err) {
    if (err instanceof BillingError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[Billing] top-up failed:", err);
    return NextResponse.json({ error: "Could not start the payment." }, { status: 500 });
  }
}
