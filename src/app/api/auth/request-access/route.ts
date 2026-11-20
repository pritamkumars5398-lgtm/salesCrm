import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { SetupRequest } from "@/lib/models/SetupRequest";
import { clientIp, hitRateLimit } from "@/server/auth/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const wait = hitRateLimit(`request-access:${clientIp(req)}`);
    if (wait) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${Math.ceil(wait / 60)} min.` },
        { status: 429 }
      );
    }

    await connectDB();
    const body = await req.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").toLowerCase().trim();
    const phone = String(body.phone ?? body.businessPhone ?? "").trim();
    const businessName = String(body.businessName ?? "").trim();
    const businessWebsite = String(body.businessWebsite ?? "").trim();
    const businessServices = String(body.businessServices ?? "").trim();
    const docLink = String(body.docLink ?? "").trim();
    const customPrompt = String(body.customPrompt ?? "").trim();

    if (!name || !email) {
      return NextResponse.json({ error: "Name and work email are required." }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const request = await SetupRequest.create({
      name: name.slice(0, 80),
      email,
      phone: phone.slice(0, 30),
      businessName: businessName.slice(0, 120),
      businessWebsite: businessWebsite.slice(0, 200),
      businessServices: businessServices.slice(0, 1000),
      docLink: docLink.slice(0, 500),
      customPrompt: customPrompt.slice(0, 2000),
      status: "pending",
    });

    return NextResponse.json(
      {
        success: true,
        message: "Your setup request has been received. Our team will contact you shortly to review your requirements, configure your dedicated AI voice & outreach engines, and set up your account.",
        requestId: String(request._id),
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    console.error("[Request Access API Error]", err);
    return NextResponse.json({ error: "Failed to submit request. Please try again." }, { status: 500 });
  }
}
