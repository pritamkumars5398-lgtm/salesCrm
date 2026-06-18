const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb+srv://pritamkumars5398_db_user:9bDrcqLpO07PP81x@cluster0.dj2kdak.mongodb.net/salesagent');
  const db = mongoose.connection;

  const lead = await db.collection('leads').findOne({ fullName: /Difwa Difmo/i });
  if (!lead) return console.log("Lead not found");

  const r = await fetch('http://localhost:3001/api/leads/' + lead._id + '/response?action=interested', {
    method: 'GET'
  });
  console.log("Response status:", r.status);
  console.log("HTML:", await r.text());

  // wait for the background email to send
  await new Promise(res => setTimeout(res, 5000));
  
  const convos = await db.collection('conversations').find({ leadId: lead._id }).toArray();
  console.log('CONVOS:', JSON.stringify(convos, null, 2));

  process.exit(0);
}
run().catch(console.error);
