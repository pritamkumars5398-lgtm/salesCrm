import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import {
  startApifyRuns,
  getRunStatus,
  importDataset,
  abortApifyRun,
  type ScraperType,
} from "@/server/services/apify.service";

// ─── POST — start all enabled scraper runs in parallel ───────────────────────
export async function POST(req: Request) {
  await connectDB();
  const { agentId } = (await req.json()) as { agentId: string };
  if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });

  try {
    const { started, warnings } = await startApifyRuns(agentId);
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
  const agentId = searchParams.get("agentId");
  if (!runId || !agentId) return NextResponse.json({ error: "runId and agentId required" }, { status: 400 });

  try {
    return NextResponse.json(await getRunStatus(agentId, runId));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("token not set") ? 400 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}

// ─── PATCH — import one dataset into leads ───────────────────────────────────
export async function PATCH(req: Request) {
  await connectDB();
  const { agentId, datasetId, scraperType } = (await req.json()) as {
    agentId: string;
    datasetId: string;
    scraperType: ScraperType;
  };
  if (!agentId || !datasetId) return NextResponse.json({ error: "agentId and datasetId required" }, { status: 400 });

  try {
    const result = await importDataset(agentId, datasetId, scraperType);
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
  const { runId, agentId } = (await req.json()) as { runId: string; agentId: string };
  if (!runId || !agentId) return NextResponse.json({ error: "runId and agentId required" }, { status: 400 });

  try {
    await abortApifyRun(agentId, runId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
