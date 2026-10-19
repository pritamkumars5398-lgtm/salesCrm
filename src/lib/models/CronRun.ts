import { Schema, Document, Model, Types } from "mongoose";
import { defineModel } from "./define-model";

/** One execution of a schedule — what it did, and the outreach campaign it started. */
export interface ICronRun extends Document {
  jobId: Types.ObjectId;
  agentId: Types.ObjectId;
  trigger: "schedule" | "manual";
  status: "running" | "done" | "failed";
  detail: string;
  campaignId?: Types.ObjectId | null;
  startedAt: Date;
  finishedAt?: Date;
}

const CronRunSchema = new Schema<ICronRun>(
  {
    jobId:      { type: Schema.Types.ObjectId, ref: "CronJob", required: true },
    agentId:    { type: Schema.Types.ObjectId, ref: "Agent", required: true },
    trigger:    { type: String, enum: ["schedule", "manual"], required: true },
    status:     { type: String, enum: ["running", "done", "failed"], default: "running" },
    detail:     { type: String, default: "" },
    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign", default: null },
    startedAt:  { type: Date, default: Date.now },
    finishedAt: { type: Date },
  },
  { timestamps: false }
);

CronRunSchema.index({ jobId: 1, startedAt: -1 });
// Keep three months of run history.
CronRunSchema.index({ startedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const CronRun: Model<ICronRun> = defineModel<ICronRun>("CronRun", CronRunSchema);
