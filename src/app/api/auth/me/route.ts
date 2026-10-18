import { NextResponse } from "next/server";
import { User } from "@/lib/models/User";
import { authorizeUser } from "@/server/auth/access";
import { ensureOrganizationForUser, listWorkspacesForUser } from "@/server/services/workspace.service";

/**
 * GET /api/auth/me — who is signed in, their organizations and the workspaces
 * they can open. The app shell boots from this instead of trusting localStorage.
 */
export async function GET(req: Request) {
  try {
    const auth = await authorizeUser(req);
    if (!auth.ok) return auth.response;
    // Cheap when nothing is pending; picks up invites sent while the user was signed in.
    await ensureOrganizationForUser(auth.user);
    const { organizations, workspaces } = await listWorkspacesForUser(auth.user._id);
    return NextResponse.json({
      user: { name: auth.user.name, email: auth.user.email, isSuperadmin: auth.user.isSuperadmin },
      organizations,
      workspaces,
    });
  } catch (err: unknown) {
    console.error("[Auth me]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

/** PUT { name } — update the signed-in user's display name. */
export async function PUT(req: Request) {
  const auth = await authorizeUser(req);
  if (!auth.ok) return auth.response;
  const { name } = await req.json().catch(() => ({}));
  const clean = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!clean) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  await User.updateOne({ _id: auth.user._id }, { $set: { name: clean } });
  return NextResponse.json({ name: clean });
}
