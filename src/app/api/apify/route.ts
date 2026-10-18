import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import {
  startApifyRuns,
  getRunStatus,
  importDataset,
  abortApifyRun,
  type ScraperType,
} from "@/server/services/apify.service";
import { authorizeWorkspace } from "@/server/auth/access";

// ─── POST — start all enabled scraper runs in parallel ───────────────────────
export async function POST(req: Request) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const access = await authorizeWorkspace(req, body.agentId);
  if (!access.ok) return access.response;

  try {
    const { started, warnings } = await startApifyRuns(access.agentId);
    return NextResponse.json({
      runs: started,
      ...(warnings.length ? { warnings } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("No enabled scrapers") ? 400 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}

// ─── GET — poll a single run status ─────────────────────────────────────────
export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const runId   = searchParams.get("runId");
  const access = await authorizeWorkspace(req, searchParams.get("agentId"));
  if (!access.ok) return access.response;
  if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

  try {
    return NextResponse.json(await getRunStatus(access.agentId, runId));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("token not set") ? 400 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}

// ─── PATCH — import one dataset into leads ───────────────────────────────────
export async function PATCH(req: Request) {
  await connectDB();
  const { agentId, datasetId, scraperType } = (await req.json().catch(() => ({}))) as {
    agentId?: string;
    datasetId?: string;
    scraperType: ScraperType;
  };
  const access = await authorizeWorkspace(req, agentId);
  if (!access.ok) return access.response;
  if (!datasetId) return NextResponse.json({ error: "datasetId required" }, { status: 400 });

  try {
    const result = await importDataset(access.agentId, datasetId, scraperType);
    if (result.limitReached) {
      return NextResponse.json({ error: result.message, limitReached: true }, { status: 403 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("token not set") ? 400 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}

// ─── DELETE — abort/cancel a run ───────────────────────────────────────────
export async function DELETE(req: Request) {
  await connectDB();
  const { runId, agentId } = (await req.json().catch(() => ({}))) as { runId?: string; agentId?: string };
  const access = await authorizeWorkspace(req, agentId);
  if (!access.ok) return access.response;
  if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

  try {
    await abortApifyRun(access.agentId, runId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
