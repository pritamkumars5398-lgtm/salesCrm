require("dotenv").config({ path: ".env" });
const mongoose = require("mongoose");

const orgId = new mongoose.Types.ObjectId("6ad4bcad394bce107fe22822");
const sourceAgentId = new mongoose.Types.ObjectId("6a50784535696ad592bf6634");
const workspaceName = "South India Enterprise";

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const agentsCol = mongoose.connection.db.collection("agents");
  const settingsCol = mongoose.connection.db.collection("settings");

  // Check if already exists
  let agent = await agentsCol.findOne({ organizationId: orgId, name: workspaceName, deletedAt: null });
  if (agent) {
    console.log(`Workspace "${workspaceName}" already exists with ID: ${agent._id}`);
  } else {
    const doc = {
      name: workspaceName,
      status: "active",
      leadCount: 0,
      userEmail: "dsales@gmail.com",
      organizationId: orgId,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const res = await agentsCol.insertOne(doc);
    agent = { _id: res.insertedId, ...doc };
    console.log(`Created new workspace "${workspaceName}" with ID: ${agent._id}`);

    // Copy integration settings from source agent
    const sourceSettings = await settingsCol.find({ agentId: sourceAgentId }).toArray();
    console.log(`Copying ${sourceSettings.length} configuration settings from ${sourceAgentId}...`);
    
    for (const s of sourceSettings) {
      if (s.key === "agentName") continue;
      await settingsCol.insertOne({
        agentId: agent._id,
        key: s.key,
        value: s.value
      });
    }

    // Set custom South India settings
    await settingsCol.updateOne(
      { agentId: agent._id, key: "agentName" },
      { $set: { value: workspaceName } },
      { upsert: true }
    );

    await settingsCol.updateOne(
      { agentId: agent._id, key: "callGreeting" },
      { $set: { value: "Hello! Good afternoon. Am I speaking with the manager or owner of {{company}}?" } },
      { upsert: true }
    );

    await settingsCol.updateOne(
      { agentId: agent._id, key: "callScript" },
      { $set: { value: "You are a senior tech consultant from Bangalore speaking with {{company}}. Speak professional, clear Indian English. Understand their booking and inquiry workflow, then offer a quick 2-minute live demo on WhatsApp. Never use robotic phrases." } },
      { upsert: true }
    );

    console.log("Successfully configured South India settings!");
  }

  console.log(`NEW_WORKSPACE_ID=${agent._id}`);
  mongoose.connection.close();
});
