import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IMeeting extends Document {
  agentId: Types.ObjectId;
  leadId: Types.ObjectId;
  leadName: string;
  company: string;
  title: string;
  scheduledAt: Date;
  durationMinutes: number;
  platform: string;
  status: "confirmed" | "pending" | "cancelled";
  calendarProvider: "cal.com" | "calendly" | "google";
  createdAt: Date;
  updatedAt: Date;
}

const MeetingSchema = new Schema<IMeeting>(
  {
    agentId:         { type: Schema.Types.ObjectId, ref: "Agent", required: true },
    leadId:          { type: Schema.Types.ObjectId, ref: "Lead", required: true },
    leadName:        { type: String, required: true },
    company:         { type: String },
    title:           { type: String, required: true },
    scheduledAt:     { type: Date, required: true },
    durationMinutes: { type: Number, default: 30 },
    platform:        { type: String, default: "Google Meet" },
    status:          { type: String, enum: ["confirmed", "pending", "cancelled"], default: "pending" },
    calendarProvider:{ type: String, enum: ["cal.com", "calendly", "google"], default: "google" },
  },
  { timestamps: true }
);

export const Meeting: Model<IMeeting> =
  mongoose.models.Meeting ?? mongoose.model<IMeeting>("Meeting", MeetingSchema);
