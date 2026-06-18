const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb+srv://pritamkumars5398_db_user:9bDrcqLpO07PP81x@cluster0.dj2kdak.mongodb.net/salesagent');
  const db = mongoose.connection;

  // Find the lead and update email + reset status
  const result = await db.collection('leads').findOneAndUpdate(
    { fullName: /Difwa Difmo/i },
    { $set: { status: 'new', email: 'difwaservices@gmail.com' } },
    { returnDocument: 'after' }
  );

  const lead = result;
  if (!lead) { console.log("Lead not found!"); process.exit(1); }
  console.log("Lead found:", lead.fullName, "| Email:", lead.email, "| Status:", lead.status);

  // Trigger outreach
  const r = await fetch('http://localhost:3000/api/leads/' + lead._id + '/outreach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senderName: 'Coding Of World' })
  });
  const data = await r.json();
  console.log("Outreach status:", r.status);
  console.log("Email sent:", data.emailSent);
  console.log("Subject:", data.subject);
  if (data.emailError) console.log("Email error:", data.emailError);

  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
