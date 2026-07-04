import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type CampaignStatus = "pending" | "running" | "completed" | "failed";

export interface ICampaignError {
  leadId: Types.ObjectId;
  leadName: string;
  reason: string;
}

export interface ICampaign extends Document {
  agentId: Types.ObjectId;
  trigger: "publish" | "cron" | "manual" | "retry";
  status: CampaignStatus;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  failures: ICampaignError[];
  leadIds: Types.ObjectId[];
  startedAt?: Date;
  finishedAt?: Date;
  /** heartbeat used to detect and resume stalled runs */
  lastProgressAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CampaignSchema = new Schema<ICampaign>(
  {
    agentId: { type: Schema.Types.ObjectId, ref: "Agent", required: true },
    trigger: { type: String, enum: ["publish", "cron", "manual", "retry"], default: "manual" },
    status:  { type: String, enum: ["pending", "running", "completed", "failed"], default: "pending" },
    total:   { type: Number, default: 0 },
    sent:    { type: Number, default: 0 },
    failed:  { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    failures: [{
      leadId:   { type: Schema.Types.ObjectId, ref: "Lead" },
      leadName: { type: String },
      reason:   { type: String },
    }],
    leadIds: [{ type: Schema.Types.ObjectId, ref: "Lead" }],
    startedAt:      { type: Date },
    finishedAt:     { type: Date },
    lastProgressAt: { type: Date },
  },
  { timestamps: true }
);

CampaignSchema.index({ agentId: 1, status: 1, createdAt: -1 });

export const Campaign: Model<ICampaign> =
  mongoose.models.Campaign ?? mongoose.model<ICampaign>("Campaign", CampaignSchema);
