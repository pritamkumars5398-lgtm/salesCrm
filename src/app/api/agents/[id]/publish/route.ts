import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Agent } from "@/lib/models/Agent";
import { authorizeWorkspace } from "@/server/auth/access";
import { preflightCheck } from "@/server/services/campaign.service";
import { armSchedules } from "@/server/services/cron.service";

/**
 * POST /api/agents/[id]/publish
 * Pre-flight checks the workspace's config, activates it, and ARMS its schedules.
 * Publishing does NOT send anything by itself — outreach runs when a schedule
 * fires (e.g. 9pm "Sync Apify" scrapes then contacts the new leads), or when
 * the user presses Run on the Leads page.
 *
 * Body: { dryRun?: boolean }  — dryRun returns the pre-flight result only.
 *
 * Responses:
 *  200 { published: true, schedules, warnings }  — live
 *  422 { published: false, issues, warnings }    — config blocks publishing
 */
export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  await connectDB();

  const body = await req.json().catch(() => ({}));
  // Anyone in the workspace may see what's missing; only admins may go live.
  const access = await authorizeWorkspace(req, id, { minRole: body.dryRun ? "member" : "admin" });
  if (!access.ok) return access.response;

  const preflight = await preflightCheck(id);

  if (body.dryRun) {
    return NextResponse.json({ published: false, dryRun: true, ...preflight });
  }

  if (!preflight.ok) {
    return NextResponse.json(
      { published: false, issues: preflight.issues, warnings: preflight.warnings },
      { status: 422 }
    );
  }

  await Agent.findByIdAndUpdate(id, { status: "active" });
  const schedules = await armSchedules(id);

  const warnings = [...preflight.warnings];
  if (schedules === 0) {
    warnings.push(
      "No schedules are switched on — automated outreach will not run. Create or enable one in Schedules, or use Run on the Leads page."
    );
  }

  return NextResponse.json({ published: true, schedules, warnings });
}
