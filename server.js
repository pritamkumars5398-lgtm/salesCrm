/**
 * Unified HTTP & WebSocket Server for Sales CRM
 * Runs Next.js and the Plivo-ElevenLabs Telephony Bridge on a single port.
 * Perfect for single-port deployments (Render, Railway, VPS) and Ngrok tunneling!
 */

require("dotenv").config({ path: ".env" });
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const WebSocket = require("ws");
const mongoose = require("mongoose");
const { handlePlivoStream } = require("./src/server/telephony-bridge");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

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
    handlePlivoStream(ws, req);
  });

  // Upgrade listener for WebSocket requests
  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url || "", true);

    if (pathname === "/ws/plivo" || pathname?.startsWith("/ws/plivo")) {
      plivoWss.handleUpgrade(req, socket, head, (ws) => {
        plivoWss.emit("connection", ws, req);
      });
    }
    // Note: Other WebSockets (such as Next.js HMR) pass through untouched
  });

  server.listen(port, () => {
    console.log(`====================================================`);
    console.log(`🚀 Sales CRM Server running on http://${hostname}:${port}`);
    console.log(`📞 Plivo Telephony Bridge active on ws://${hostname}:${port}/ws/plivo`);
    console.log(`🤖 ElevenLabs Conversational AI integration active`);
    console.log(`====================================================`);
  });
});
