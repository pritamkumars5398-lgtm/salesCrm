import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IUsage extends Document {
  agentId: Types.ObjectId;
  month: string; // "YYYY-MM"
  leadsScraped: number;
  messagesSent: number;
  callsMade: number;
  emailsSent: number;
}

const UsageSchema = new Schema<IUsage>({
  agentId:      { type: Schema.Types.ObjectId, ref: "Agent", required: true },
  month:        { type: String, required: true }, // e.g. "2026-06"
  leadsScraped: { type: Number, default: 0 },
  messagesSent: { type: Number, default: 0 },
  callsMade:    { type: Number, default: 0 },
  emailsSent:   { type: Number, default: 0 },
});

UsageSchema.index({ agentId: 1, month: 1 }, { unique: true });

export const Usage: Model<IUsage> =
  mongoose.models.Usage ?? mongoose.model<IUsage>("Usage", UsageSchema);
