const mongoose = require('mongoose');

async function run() {
  try {
    await mongoose.connect('mongodb+srv://pritamkumars5398_db_user:9bDrcqLpO07PP81x@cluster0.dj2kdak.mongodb.net/salesagent');
    const db = mongoose.connection;
    const result = await db.collection('leads').updateMany(
      { fullName: { $in: [/Difmo/i, /Difwa/i] } },
      { $set: { status: 'new', pipelineStage: 'new' } }
    );
    console.log('Matched:', result.matchedCount, 'Modified:', result.modifiedCount);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();
