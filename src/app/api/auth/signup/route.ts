import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Agent } from "@/lib/models/Agent";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    await connectDB();
    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }

    // Check if user already exists
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 400 });
    }

    // Hash password using crypto
    const passwordHash = crypto.createHash("sha256").update(password).digest("hex");

    const normalizedEmail = email.toLowerCase().trim();

    // Create user
    await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
    });

    // Assign any existing orphan agents to this new user so they keep their old leads
    await Agent.updateMany(
      { $or: [{ userEmail: { $exists: false } }, { userEmail: null }] },
      { $set: { userEmail: normalizedEmail } }
    );

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err: any) {
    console.error("[Signup API Error]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
