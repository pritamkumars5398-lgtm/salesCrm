import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Agent } from "@/lib/models/Agent";
import { authorizeWorkspace } from "@/server/auth/access";
import { unpublishAgent } from "@/server/services/cron.service";
import { deleteWorkspace, renameWorkspace, WorkspaceError } from "@/server/services/workspace.service";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const access = await authorizeWorkspace(req, id);
  if (!access.ok) return access.response;
  return NextResponse.json({ ...access.agent.toObject(), role: access.role });
}

/**
 * PUT { name } renames; PUT { status: "inactive" } unpublishes.
 * Going live is only possible through POST /publish, which runs the pre-flight
 * checks — a status of "active" here is rejected.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const { id } = await params;
    const access = await authorizeWorkspace(req, id, { minRole: "admin" });
    if (!access.ok) return access.response;
    const body = await req.json().catch(() => ({}));

    if (body.status === "active") {
      return NextResponse.json({ error: "Use Publish to go live — it checks the setup first." }, { status: 400 });
    }
    if (body.name !== undefined) await renameWorkspace(access.agent, body.name);
    if (body.status === "inactive") await unpublishAgent(id);

    return NextResponse.json(await Agent.findById(id).lean());
  } catch (err) {
    if (err instanceof WorkspaceError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[Workspace] update failed:", err);
    return NextResponse.json({ error: "Could not update the workspace." }, { status: 500 });
  }
}

/** DELETE ?confirm=<workspace name> — removes the workspace and all of its data. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const { id } = await params;
    const access = await authorizeWorkspace(req, id, { minRole: "admin" });
    if (!access.ok) return access.response;
    const confirm = new URL(req.url).searchParams.get("confirm") ?? "";
    if (confirm.trim().toLowerCase() !== access.agent.name.trim().toLowerCase()) {
      return NextResponse.json({ error: "Type the workspace name to confirm deleting it." }, { status: 400 });
    }
    await deleteWorkspace(access.agent);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof WorkspaceError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[Workspace] delete failed:", err);
    return NextResponse.json({ error: "Could not delete the workspace." }, { status: 500 });
  }
}
