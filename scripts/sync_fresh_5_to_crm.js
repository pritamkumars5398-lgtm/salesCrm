require("dotenv").config({ path: ".env" });
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const resultsPath = path.join(__dirname, "last_fresh_5_results.json");
if (!fs.existsSync(resultsPath)) {
  console.error("Results file not found!");
  process.exit(1);
}

const results = JSON.parse(fs.readFileSync(resultsPath, "utf-8"));

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const agentId = new mongoose.Types.ObjectId("6a50784535696ad592bf6634");
  const callsCol = mongoose.connection.db.collection("calls");
  const leadsCol = mongoose.connection.db.collection("leads");
  const activitiesCol = mongoose.connection.db.collection("activities");

  for (const item of results) {
    const leadId = new mongoose.Types.ObjectId(item.id);
    const duration = parseInt(item.duration || 0, 10);
    const callStatus = duration > 0 ? "completed" : "no_answer";
    const summary = duration > 0 
      ? `High-conversion call connected for ${duration}s. Callee listened to tailored ${item.category} conversion pitch.`
      : `Outbound call attempt resulted in ${item.hangup || item.state}.`;

    const callDoc = {
      agentId,
      leadId,
      mode: "ai",
      isTest: false,
      provider: "plivo",
      to: item.phone,
      from: "918065535939",
      status: callStatus,
      active: false,
      token: Math.random().toString(36).substring(2, 15),
      requestUuid: item.request_uuid,
      durationSec: duration,
      billDurationSec: duration > 0 ? Math.ceil(duration / 60) * 60 : 0,
      hangupCause: item.hangup || "Normal Hangup",
      recordingUrl: item.recordingUrl || undefined,
      summary,
      transcript: [],
      outcome: duration > 10 ? "high_intent" : duration > 0 ? "partial_listen" : "no_answer",
      finalizedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await callsCol.insertOne(callDoc);

    const newStage = duration > 0 ? "contacted" : "new";
    const outreachStat = duration > 0 ? "sent" : "failed";

    await leadsCol.updateOne(
      { _id: leadId },
      {
        $set: {
          pipelineStage: newStage,
          outreachStatus: outreachStat,
          lastContactedAt: new Date(),
          updatedAt: new Date()
        },
        $inc: { outreachAttempts: 1 },
        $push: {
          notes: {
            _id: new mongoose.Types.ObjectId(),
            text: `[Call Log]: ${summary} | Duration: ${duration}s ${item.recordingUrl ? `| Recording: ${item.recordingUrl}` : ""}`,
            author: "Outbound AI Engine",
            createdAt: new Date()
          }
        }
      }
    );

    await activitiesCol.insertOne({
      agentId,
      leadId,
      type: "call",
      title: `High-Conversion Call: ${item.company}`,
      description: summary,
      createdAt: new Date()
    });
  }

  console.log("Synced 5 fresh conversion leads to CRM MongoDB!");
  mongoose.connection.close();
});
