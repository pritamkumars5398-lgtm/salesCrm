import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAgent extends Document {
  name: string;
  status: "active" | "inactive";
  leadCount: number;
  userEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AgentSchema = new Schema<IAgent>(
  {
    name:      { type: String, required: true, trim: true },
    status:    { type: String, enum: ["active", "inactive"], default: "active" },
    leadCount: { type: Number, default: 0 },
    userEmail: { type: String, trim: true, lowercase: true },
  },
  { timestamps: true }
);

AgentSchema.index({ userEmail: 1 });

export const Agent: Model<IAgent> =
  mongoose.models.Agent ?? mongoose.model<IAgent>("Agent", AgentSchema);
