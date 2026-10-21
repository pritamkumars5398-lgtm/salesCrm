require("dotenv").config({ path: ".env" });
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const resultsPath = path.join(__dirname, "last_10_call_results.json");
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
    const phone = item.phone.startsWith("+") ? item.phone : `+${item.phone}`;
    
    let callStatus = "no_answer";
    if (item.state === "completed" || item.state === "ANSWER") {
      callStatus = "completed";
    } else if (item.state === "busy") {
      callStatus = "busy";
    } else if (item.state === "failed") {
      callStatus = "failed";
    }

    const duration = parseInt(item.duration || 0, 10);
    const summary = duration > 0 
      ? `Call connected for ${duration}s. Callee listened to tailored ${item.category} DIFMO services pitch.`
      : `Call attempt resulted in ${item.hangup || item.state}. No answer or ring timeout.`;

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
      callUuid: item.request_uuid,
      durationSec: duration,
      billDurationSec: duration > 0 ? Math.ceil(duration / 60) * 60 : 0,
      hangupCause: item.hangup || "Normal Hangup",
      summary: summary,
      transcript: [],
      outcome: duration > 10 ? "engaged" : duration > 0 ? "partial_listen" : "no_answer",
      finalizedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await callsCol.insertOne(callDoc);
    console.log(`Saved Call record for ${item.company} (${phone}) -> Duration: ${duration}s, Status: ${callStatus}`);

    // Update lead status in CRM
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
            text: `[Call Log]: ${summary} | Hangup: ${item.hangup || "N/A"}`,
            author: "Outbound AI Engine",
            createdAt: new Date()
          },
          history: {
            field: "outreachStatus",
            from: "none",
            to: outreachStat,
            by: "AI Voice Engine",
            at: new Date(),
            note: `Attempted outbound call via Plivo (${duration}s)`
          }
        }
      }
    );

    // Add activity
    await activitiesCol.insertOne({
      agentId,
      leadId,
      type: "call",
      title: `AI Outbound Call Attempt: ${item.company}`,
      description: summary,
      createdAt: new Date()
    });
  }

  console.log("All 10 calls, leads, notes, and activities synchronized in Sales CRM MongoDB!");
  mongoose.connection.close();
});
