import mongoose, { Schema, Document, Model, Types } from "mongoose";
import type { Channel } from "./Lead";

export interface IActivity extends Document {
  agentId: Types.ObjectId;
  leadId: Types.ObjectId;
  leadName: string;
  channel: Channel | "system";
  event: string;
  detail?: string;
  createdAt: Date;
}

const ActivitySchema = new Schema<IActivity>(
  {
    agentId:  { type: Schema.Types.ObjectId, ref: "Agent", required: true },
    leadId:   { type: Schema.Types.ObjectId, ref: "Lead", required: true },
    leadName: { type: String, required: true },
    channel:  { type: String, enum: ["email", "whatsapp", "sms", "call", "system"], required: true },
    event:    { type: String, required: true },
    detail:   { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ActivitySchema.index({ agentId: 1, createdAt: -1 });

export const Activity: Model<IActivity> =
  mongoose.models.Activity ?? mongoose.model<IActivity>("Activity", ActivitySchema);
