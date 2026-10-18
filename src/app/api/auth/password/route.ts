import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { hashPassword, verifyPassword } from "@/lib/password";
import { SESSION_COOKIE, signSession, sessionCookieOptions } from "@/lib/session";
import { authorizeUser } from "@/server/auth/access";
import { clientIp, hitRateLimit } from "@/server/auth/rate-limit";

/**
 * POST { currentPassword, newPassword } — change the password. Every other
 * session is signed out (sessionVersion bump); this browser gets a fresh cookie.
 */
export async function POST(req: Request) {
  await connectDB();
  const auth = await authorizeUser(req);
  if (!auth.ok) return auth.response;
  const wait = hitRateLimit(`password:${clientIp(req)}:${auth.user._id}`);
  if (wait) return NextResponse.json({ error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} min.` }, { status: 429 });

  const { currentPassword, newPassword } = await req.json().catch(() => ({}));
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return NextResponse.json({ error: "The new password must be at least 8 characters." }, { status: 400 });
  }
  const user = await User.findById(auth.user._id);
  if (!user || !verifyPassword(String(currentPassword ?? ""), user.passwordHash).ok) {
    return NextResponse.json({ error: "Your current password is wrong." }, { status: 400 });
  }

  user.passwordHash = hashPassword(newPassword);
  user.sessionVersion = (user.sessionVersion ?? 0) + 1;
  await user.save();

  const token = await signSession({ uid: String(user._id), email: user.email, sv: user.sessionVersion });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
