import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type CronAction = "start_outreach" | "sync_apify" | "send_report" | "pause_agent" | "resume_agent";

export interface ICronJob extends Document {
  agentId: Types.ObjectId;
  name: string;
  cronExpression: string;
  action: CronAction;
  enabled: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
  runCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const CronJobSchema = new Schema<ICronJob>(
  {
    agentId:        { type: Schema.Types.ObjectId, ref: "Agent", required: true },
    name:           { type: String, required: true, trim: true },
    cronExpression: { type: String, required: true },
    action:         {
      type: String,
      enum: ["start_outreach", "sync_apify", "send_report", "pause_agent", "resume_agent"],
      required: true,
    },
    enabled:   { type: Boolean, default: true },
    lastRunAt: { type: Date },
    nextRunAt: { type: Date },
    runCount:  { type: Number, default: 0 },
  },
  { timestamps: true }
);

CronJobSchema.index({ agentId: 1 });

export const CronJob: Model<ICronJob> =
  mongoose.models.CronJob ?? mongoose.model<ICronJob>("CronJob", CronJobSchema);
