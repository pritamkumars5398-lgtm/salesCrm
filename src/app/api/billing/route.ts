import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Payment } from "@/lib/models/Payment";
import { authorizeWorkspace } from "@/server/auth/access";
import { getOrganizationLimits } from "@/server/services/workspace.service";
import { daysLeft, razorpayConfig, PLAN_PERIOD_DAYS } from "@/server/services/billing.service";

/** GET ?agentId — the organization's plan period, days left and payment history. */
export async function GET(req: Request) {
  await connectDB();
  const access = await authorizeWorkspace(req, new URL(req.url).searchParams.get("agentId"));
  if (!access.ok) return access.response;
  const { enabled } = razorpayConfig();
  if (!access.organizationId) {
    return NextResponse.json({ enabled: false, canPay: false, plan: null, payments: [] });
  }
  const [plan, payments] = await Promise.all([
    getOrganizationLimits(access.organizationId),
    Payment.find({ organizationId: access.organizationId, status: { $ne: "created" } }).sort({ createdAt: -1 }).limit(24).lean(),
  ]);
  return NextResponse.json({
    enabled,
    canPay: access.role === "owner" || access.role === null,
    periodDays: PLAN_PERIOD_DAYS,
    plan: {
      current: plan.planId,
      purchased: plan.purchasedPlan,
      expiresAt: plan.expiresAt,
      expired: plan.expired,
      daysLeft: plan.expired ? 0 : daysLeft(plan.expiresAt),
    },
    payments: payments.map((p) => ({
      _id: String(p._id), planId: p.planId, amount: p.amount / 100, status: p.status,
      periodStart: p.periodStart, periodEnd: p.periodEnd, creditedDays: p.creditedDays ?? 0,
      failureReason: p.failureReason, createdAt: p.createdAt,
    })),
  });
}
