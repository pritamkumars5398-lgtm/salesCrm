import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { authorizeUser } from "@/server/auth/access";

const MAX_BYTES = 10 * 1024 * 1024;
/** Media we can attach to WhatsApp/email. Never .html/.svg/.js — they'd be served from our own origin. */
const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".mp3", ".ogg", ".m4a", ".mp4", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt"]);

export async function POST(req: Request) {
  try {
    const auth = await authorizeUser(req);
    if (!auth.ok) return auth.response;

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    const ext = (path.extname(file.name) || "").toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json({ error: "That file type can't be uploaded." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Files can be at most 10 MB." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create public/uploads directory if it doesn't exist
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Unique filename
    const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}${ext}`;
    const filepath = path.join(uploadDir, filename);

    fs.writeFileSync(filepath, buffer);

    // Retrieve request origin, respecting reverse proxies like ngrok
    const proto = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
    const fileUrl = `${proto}://${host}/uploads/${filename}`;

    return NextResponse.json({ url: fileUrl });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 500 });
  }
}
