import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { hashPassword } from "@/lib/password";
import { SESSION_COOKIE, signSession, sessionCookieOptions } from "@/lib/session";
import { ensureOrganizationForUser } from "@/server/services/workspace.service";
import { clientIp, hitRateLimit } from "@/server/auth/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const wait = hitRateLimit(`signup:${clientIp(req)}`);
    if (wait) return NextResponse.json({ error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} min.` }, { status: 429 });

    await connectDB();
    const body = await req.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").toLowerCase().trim();
    const password = String(body.password ?? "");

    if (!name || !email || !password) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    let user;
    try {
      user = await User.create({ name: name.slice(0, 80), email, passwordHash: hashPassword(password) });
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 11000) {
        return NextResponse.json({ error: "An account with this email already exists." }, { status: 400 });
      }
      throw err;
    }

    // Joins any organization that invited this email; otherwise creates the user's own.
    await ensureOrganizationForUser({ _id: String(user._id), name: user.name, email: user.email });

    const token = await signSession({ uid: String(user._id), email: user.email, sv: user.sessionVersion ?? 0 });
    const response = NextResponse.json({ name: user.name, email: user.email }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    response.cookies.set("sa_auth", "", { path: "/", maxAge: 0 });
    return response;
  } catch (err: unknown) {
    console.error("[Signup API Error]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
