import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Membership } from "@/lib/models/Membership";
import { Agent } from "@/lib/models/Agent";
import { authorizeOrganization, authorizeUser } from "@/server/auth/access";
import { createWorkspace, listWorkspacesForUser, WorkspaceError } from "@/server/services/workspace.service";

/** GET /api/agents — the workspaces the signed-in user can open. */
export async function GET(req: Request) {
  await connectDB();
  const auth = await authorizeUser(req);
  if (!auth.ok) return auth.response;
  const { workspaces } = await listWorkspacesForUser(auth.user._id);
  return NextResponse.json(workspaces);
}

/**
 * POST /api/agents — create a workspace (a business line).
 * Body: { name, templateId?, organizationId?, copyIntegrationsFrom?, settings? }
 * Defaults to the organization the caller owns, else the first one they administer.
 */
export async function POST(req: Request) {
  try {
    await connectDB();
    const auth = await authorizeUser(req);
    if (!auth.ok) return auth.response;
    const body = await req.json().catch(() => ({}));

    let organizationId: string | undefined = typeof body.organizationId === "string" ? body.organizationId : undefined;
    if (!organizationId) {
      const memberships = await Membership.find({ userId: auth.user._id, role: { $in: ["owner", "admin"] } })
        .sort({ role: -1 }).lean();
      const owned = memberships.find((m) => m.role === "owner") ?? memberships[0];
      if (!owned) return NextResponse.json({ error: "Only organization admins can create workspaces." }, { status: 403 });
      organizationId = String(owned.organizationId);
    }
    const org = await authorizeOrganization(req, organizationId, { minRole: "admin" });
    if (!org.ok) return org.response;

    // The app shell auto-creates a first workspace for brand-new accounts. Never
    // do that when the user already has one somewhere (e.g. not migrated yet) —
    // a reload loop would otherwise pile up empty duplicates.
    if (body.onlyIfNone) {
      const existing = await Agent.exists({
        deletedAt: null,
        $or: [{ organizationId }, { userEmail: auth.user.email, organizationId: null }],
      });
      if (existing) return NextResponse.json({ error: "You already have a workspace." }, { status: 409 });
    }

    const settings: Record<string, string> = {};
    if (body.settings && typeof body.settings === "object") {
      for (const [k, v] of Object.entries(body.settings as Record<string, unknown>)) {
        // Onboarding may only seed profile/playbook text, never plan or credentials.
        if (typeof v === "string" && /^(business(Website|Phone|Services|Type)|docLink|customPrompt|followUpDays|industry|offerSummary|targetCustomer|callGoal|brandName)$/.test(k)) {
          settings[k] = v.slice(0, 5000);
        }
      }
    }

    const agent = await createWorkspace({
      organizationId,
      name: body.name,
      templateId: typeof body.templateId === "string" ? body.templateId : undefined,
      creatorEmail: auth.user.email,
      copyIntegrationsFrom: typeof body.copyIntegrationsFrom === "string" && body.copyIntegrationsFrom ? body.copyIntegrationsFrom : null,
      settings,
    });
    const { workspaces } = await listWorkspacesForUser(auth.user._id);
    return NextResponse.json(workspaces.find((w) => w._id === String(agent._id)) ?? agent, { status: 201 });
  } catch (err) {
    if (err instanceof WorkspaceError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[Workspaces] create failed:", err);
    return NextResponse.json({ error: "Could not create the workspace." }, { status: 500 });
  }
}
