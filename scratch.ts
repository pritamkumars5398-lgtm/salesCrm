import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log("Connected to MongoDB.");

  const db = mongoose.connection.db;
  const leadCollection = db.collection("leads");
  const convoCollection = db.collection("conversations");

  const phone = "7366832927";
  const lead = await leadCollection.findOne({ phone: { $regex: phone + "$" } });
  
  if (!lead) {
    console.log("Lead not found with phone:", phone);
    process.exit(0);
  }

  console.log("Found lead:", lead._id);

  // Delete matching conversations
  const delResult = await convoCollection.deleteMany({ leadId: lead._id.toString() });
  console.log("Deleted conversations (string):", delResult.deletedCount);
  
  const delResult2 = await convoCollection.deleteMany({ leadId: lead._id });
  console.log("Deleted conversations (ObjectId):", delResult2.deletedCount);
  
  await leadCollection.updateOne(
    { _id: lead._id }, 
    { $set: { status: "new" } }
  );
  console.log("Reset lead status to 'new'");

  process.exit(0);
};

run().catch(console.error);
