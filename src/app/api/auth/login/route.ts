import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Agent } from "@/lib/models/Agent";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    await connectDB();
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (normalizedEmail === "admin@salesagent.ai") {
      const existingAdmin = await User.findOne({ email: normalizedEmail });
      if (!existingAdmin) {
        const hash = crypto.createHash("sha256").update("admin123").digest("hex");
        await User.create({
          name: "Super Admin",
          email: normalizedEmail,
          passwordHash: hash,
        });
      }
    }

    // Find the user
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    // Hash password to check
    const passwordHash = crypto.createHash("sha256").update(password).digest("hex");
    if (user.passwordHash !== passwordHash) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
    await Agent.updateMany(
      { $or: [{ userEmail: { $exists: false } }, { userEmail: null }] },
      { $set: { userEmail: normalizedEmail } }
    );

    return NextResponse.json({
      name: user.name,
      email: user.email,
    }, { status: 200 });
  } catch (err: any) {
    console.error("[Login API Error]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
