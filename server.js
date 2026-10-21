/**
 * Unified HTTP & WebSocket Server for Sales CRM
 * Runs Next.js and the Plivo-ElevenLabs Telephony Bridge on a single port.
 * Perfect for single-port deployments (Render, Railway, VPS) and Ngrok tunneling!
 */

require("dotenv").config({ path: ".env" });
process.env.WS_NO_BUFFER_UTIL = "true";
// Lets the Next app know the /ws/plivo bridge is being served (set before Next
// loads so any worker it spawns inherits it). AI calls are refused without it.
process.env.TELEPHONY_BRIDGE_ACTIVE = "1";
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const WebSocket = require("ws");
const mongoose = require("mongoose");
const { handlePlivoStream } = require("./src/server/telephony-bridge");
const { handleListener } = require("./src/server/live-listen");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

// The custom server builds with webpack (Turbopack's custom-server mode is
// unstable in Next 15). Build into its own folder so it never mixes output with
// `npm run dev` (--turbopack) in .next — that breaks client chunk loading.
// See distDir in next.config.ts.
if (dev && !process.env.NEXT_DIST_DIR) process.env.NEXT_DIST_DIR = ".next-bridge";
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log("🔌 Connected to MongoDB Atlas"))
    .catch((err) => console.error("MongoDB Connection Error:", err.message));
}

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error handling request:", req.url, err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  // Dedicated WebSocket server for Plivo bidirectional audio streaming
  const plivoWss = new WebSocket.Server({ noServer: true });

  plivoWss.on("connection", (ws, req) => {
    handlePlivoStream(ws, req).catch((err) => {
      console.error("[TelephonyBridge] Unhandled stream error:", err);
      try { ws.close(); } catch {}
    });
  });

  // Browsers listening to live calls (see src/server/live-listen.js)
  const listenWss = new WebSocket.Server({ noServer: true });
  listenWss.on("connection", (ws, req) => {
    handleListener(ws, req).catch(() => { try { ws.close(); } catch {} });
  });

  const OWN_WS_PATHS = { "/ws/plivo": plivoWss, "/ws/listen": listenWss };
  const isOwnUpgrade = (req) => !!OWN_WS_PATHS[parse(req.url || "").pathname];

  function handleOwnUpgrade(req, socket, head) {
    const wss = OWN_WS_PATHS[parse(req.url || "").pathname];
    if (!wss) return; // Next.js HMR etc. are handled by Next's own listener
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  }

  // Next.js attaches its own "upgrade" listener to this server on the first
  // request and ends every socket it doesn't own — including /ws/plivo, which
  // made calls drop ~300ms after pickup. Keep foreign upgrade listeners off our path.
  for (const method of ["on", "addListener", "prependListener"]) {
    const original = server[method].bind(server);
    server[method] = (event, listener) =>
      event === "upgrade" && listener !== handleOwnUpgrade
        ? original(event, (req, socket, head) => { if (!isOwnUpgrade(req)) listener(req, socket, head); })
        : original(event, listener);
  }

  server.on("upgrade", handleOwnUpgrade);

  server.listen(port, () => {
    console.log(`====================================================`);
    console.log(`🚀 Sales CRM Server running on http://${hostname}:${port}`);
    console.log(`📞 Plivo Telephony Bridge active on ws://${hostname}:${port}/ws/plivo`);
    console.log(`🤖 ElevenLabs Conversational AI integration active`);
    console.log(`====================================================`);
    startScheduler();
  });
});

/**
 * Schedules only run when something calls /api/crons/execute. This server is
 * long-running, so it does that itself once a minute (the route claims each
 * due job atomically, so an external cron calling it too can't double-run).
 * Set DISABLE_INTERNAL_SCHEDULER=true when a hosted cron already calls it.
 */
function startScheduler() {
  if (process.env.DISABLE_INTERNAL_SCHEDULER === "true") return;
  let running = false;
  const tick = async () => {
    if (running) return; // a slow run (outreach batch) is still going
    running = true;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/crons/execute`, {
        method: "POST",
        headers: process.env.CRON_SECRET ? { Authorization: `Bearer ${process.env.CRON_SECRET}` } : {},
        signal: AbortSignal.timeout(10 * 60 * 1000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) console.error(`[Scheduler] /api/crons/execute answered ${res.status}`);
      else if (body.ran > 0 || body.resumedCampaigns?.length) console.log("[Scheduler]", JSON.stringify(body.results ?? []), body.resumedCampaigns ?? []);
    } catch (err) {
      console.error("[Scheduler] tick failed:", err.message);
    } finally {
      running = false;
    }
  };
  // First tick after the app has warmed up, then every minute.
  setTimeout(tick, 15000);
  setInterval(tick, 60000);
  console.log("⏰ Scheduler running — due schedules are checked every minute");
}
