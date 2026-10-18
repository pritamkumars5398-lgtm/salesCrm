import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Usage } from "@/lib/models/Usage";
import { Setting } from "@/lib/models/Setting";
import { Organization } from "@/lib/models/Organization";
import { PLANS, type PlanId } from "@/lib/plans";
import { currentMonth } from "@/lib/utils/date";
import { authorizeWorkspace } from "@/server/auth/access";
import { getOrganizationLimits, getOrganizationUsage } from "@/server/services/workspace.service";

const USAGE_FIELDS = ["leadsScraped", "messagesSent", "callsMade", "emailsSent", "smsSent"] as const;

/**
 * GET ?agentId — the plan and this month's usage. For workspaces in an
 * organization both are organization-wide (all business lines share one quota).
 */
export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const access = await authorizeWorkspace(req, searchParams.get("agentId"));
  if (!access.ok) return access.response;
  const agentId = access.agentId;
  const month = currentMonth();

  if (access.organizationId) {
    const [{ planId, limits }, usage] = await Promise.all([
      getOrganizationLimits(access.organizationId),
      getOrganizationUsage(access.organizationId, month),
    ]);
    const plan = PLANS[planId];
    return NextResponse.json({
      month,
      planId,
      scope: "organization",
      plan: { name: plan.name, priceINR: plan.priceINR, color: plan.color, limits },
      usage,
    });
  }

  const [usage, planRow, customLimitsRow] = await Promise.all([
    Usage.findOne({ agentId, month }).lean(),
    Setting.findOne({ agentId, key: "plan" }).lean(),
    Setting.findOne({ agentId, key: "custom_limits" }).lean(),
  ]);

  const planId = (planRow?.value && PLANS[planRow.value as PlanId] ? planRow.value : "free") as PlanId;
  const plan = PLANS[planId];

  let limits = { ...plan.limits };
  if (customLimitsRow?.value) {
    try {
      const parsed = JSON.parse(customLimitsRow.value);
      limits = { ...limits, ...parsed };
    } catch (e) {
      console.error("Failed to parse custom limits", e);
    }
  }

  return NextResponse.json({
    month,
    planId,
    scope: "workspace",
    plan: { name: plan.name, priceINR: plan.priceINR, color: plan.color, limits },
    usage: {
      leadsScraped: usage?.leadsScraped ?? 0,
      messagesSent: usage?.messagesSent ?? 0,
      callsMade:    usage?.callsMade    ?? 0,
      emailsSent:   usage?.emailsSent   ?? 0,
      smsSent:      usage?.smsSent      ?? 0,
    },
  });
}

// POST: increment a usage counter
export async function POST(req: Request) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const access = await authorizeWorkspace(req, body.agentId);
  if (!access.ok) return access.response;
  const by = Number.isInteger(body.by) && body.by > 0 && body.by <= 1000 ? body.by : 1;
  if (!USAGE_FIELDS.includes(body.field)) return NextResponse.json({ error: "invalid field" }, { status: 400 });

  await Usage.findOneAndUpdate(
    { agentId: access.agentId, month: currentMonth() },
    { $inc: { [body.field]: by } },
    { upsert: true }
  );

  return NextResponse.json({ ok: true });
}

/**
 * PATCH { agentId, planId } — change the organization's plan without paying
 * (owner only: it's billing). Moving to Free is always allowed and ends any
 * paid period. Paid plans are bought through Razorpay (/api/billing/order);
 * only superadmins — or ALLOW_SELF_SERVE_PLAN_CHANGE=true while testing —
 * can switch to a paid plan here, and that plan then has no expiry.
 * Nothing is deleted on a downgrade: extra workspaces stay (no new ones can be
 * created) and sends stop for the month once the new limits are used up.
 */
export async function PATCH(req: Request) {
  await connectDB();
  const { agentId, planId } = (await req.json().catch(() => ({}))) as { agentId?: string; planId?: PlanId };
  const access = await authorizeWorkspace(req, agentId, { minRole: "owner" });
  if (!access.ok) return access.response;
  if (!planId || !PLANS[planId]) {
    return NextResponse.json({ error: "invalid planId" }, { status: 400 });
  }

  if (planId !== "free" && !access.user.isSuperadmin && process.env.ALLOW_SELF_SERVE_PLAN_CHANGE !== "true") {
    return NextResponse.json({ error: "Paid plans are bought with the Pay button (Razorpay)." }, { status: 402 });
  }

  if (access.organizationId) {
    await Organization.updateOne({ _id: access.organizationId }, { $set: { plan: planId, planExpiresAt: null } });
  } else {
    await Setting.findOneAndUpdate(
      { agentId: access.agentId, key: "plan" },
      { $set: { value: planId } },
      { upsert: true }
    );
  }

  return NextResponse.json({ ok: true, planId });
}
