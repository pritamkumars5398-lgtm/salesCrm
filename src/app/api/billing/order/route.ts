import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { PLANS, type PlanId } from "@/lib/plans";
import { authorizeWorkspace } from "@/server/auth/access";
import { BillingError, createPlanOrder, isFakePayment, applyFakeSubscription } from "@/server/services/billing.service";

/** POST { agentId, planId } — start a Razorpay checkout for 30 days of a plan (organization owner only). */
export async function POST(req: Request) {
  try {
    await connectDB();
    const body = await req.json().catch(() => ({}));
    const access = await authorizeWorkspace(req, body.agentId, { minRole: "owner" });
    if (!access.ok) return access.response;
    if (!access.organizationId) return NextResponse.json({ error: "Log out and back in once, then try again." }, { status: 409 });
    const planId = body.planId as PlanId;
    if (!PLANS[planId] || planId === "free") return NextResponse.json({ error: "Pick a paid plan." }, { status: 400 });

    if (isFakePayment()) {
      const paid = await applyFakeSubscription(access.organizationId, access.user._id, planId);
      return NextResponse.json({
        fake: true,
        planId: paid.planId,
        periodEnd: paid.periodEnd,
        creditedDays: paid.creditedDays ?? 0,
        message: `${PLANS[planId].name} plan directly activated (Fake Payment Mode).`,
      });
    }

    const order = await createPlanOrder(access.organizationId, access.user._id, planId);
    return NextResponse.json({
      ...order,
      name: "SalesAgent",
      description: `${PLANS[planId].name} plan — 30 days`,
      prefill: { name: access.user.name, email: access.user.email },
    });
  } catch (err) {
    if (err instanceof BillingError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[Billing] order failed:", err);
    return NextResponse.json({ error: "Could not start the payment." }, { status: 500 });
  }
}
