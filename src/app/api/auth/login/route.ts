import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { hashPassword, verifyPassword } from "@/lib/password";
import { SESSION_COOKIE, signSession, sessionCookieOptions } from "@/lib/session";
import { ensureOrganizationForUser } from "@/server/services/workspace.service";
import { clearRateLimit, clientIp, hitRateLimit } from "@/server/auth/rate-limit";

export async function POST(req: Request) {
  try {
    await connectDB();
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").toLowerCase().trim();
    const password = String(body.password ?? "");

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const limitKey = `login:${clientIp(req)}:${email}`;
    const wait = hitRateLimit(limitKey);
    if (wait) return NextResponse.json({ error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} min.` }, { status: 429 });

    const user = await User.findOne({ email });
    const check = user ? verifyPassword(password, user.passwordHash) : { ok: false, needsRehash: false };
    if (!user || !check.ok) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
    clearRateLimit(limitKey);

    if (check.needsRehash) {
      await User.updateOne({ _id: user._id }, { $set: { passwordHash: hashPassword(password) } });
    }

    await ensureOrganizationForUser({ _id: String(user._id), name: user.name, email: user.email });

    const token = await signSession({ uid: String(user._id), email: user.email, sv: user.sessionVersion ?? 0 });
    const response = NextResponse.json({ name: user.name, email: user.email }, { status: 200 });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    // The old client-set flag cookie meant nothing; make sure it's gone.
    response.cookies.set("sa_auth", "", { path: "/", maxAge: 0 });
    return response;
  } catch (err: unknown) {
    console.error("[Login API Error]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
