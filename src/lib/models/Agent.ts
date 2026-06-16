import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAgent extends Document {
  name: string;
  status: "active" | "inactive";
  leadCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const AgentSchema = new Schema<IAgent>(
  {
    name:      { type: String, required: true, trim: true },
    status:    { type: String, enum: ["active", "inactive"], default: "active" },
    leadCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Agent: Model<IAgent> =
  mongoose.models.Agent ?? mongoose.model<IAgent>("Agent", AgentSchema);
