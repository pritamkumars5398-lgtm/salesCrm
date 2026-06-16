import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type LeadStatus = "new" | "in_outreach" | "replied" | "meeting_booked" | "closed";
export type LeadSource = "LinkedIn" | "Google Maps" | "JustDial" | "Manual" | "Apify" | "Referral";
export type Channel = "email" | "whatsapp" | "sms" | "call";

export interface ILead extends Document {
  agentId: Types.ObjectId;
  firstName: string;
  lastName: string;
  fullName: string;
  jobTitle: string;
  company: string;
  email: string;
  phone: string;
  source: LeadSource;
  channels: Channel[];
  status: LeadStatus;
  sequenceId?: Types.ObjectId;
  pipelineStage: "new" | "contacted" | "replied" | "qualified" | "closed";
  agentEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LeadSchema = new Schema<ILead>(
  {
    agentId:       { type: Schema.Types.ObjectId, ref: "Agent", required: true },
    firstName:     { type: String, required: true, trim: true },
    lastName:      { type: String, required: true, trim: true },
    fullName:      { type: String },
    jobTitle:      { type: String, trim: true },
    company:       { type: String, trim: true },
    email:         { type: String, trim: true, lowercase: true },
    phone:         { type: String, trim: true },
    source:        { type: String, enum: ["LinkedIn", "Google Maps", "JustDial", "Manual", "Apify", "Referral"], default: "Manual" },
    channels:      [{ type: String, enum: ["email", "whatsapp", "sms", "call"] }],
    status:        { type: String, enum: ["new", "in_outreach", "replied", "meeting_booked", "closed"], default: "new" },
    sequenceId:    { type: Schema.Types.ObjectId, ref: "Sequence" },
    pipelineStage: { type: String, enum: ["new", "contacted", "replied", "qualified", "closed"], default: "new" },
    agentEnabled:  { type: Boolean, default: true },
  },
  { timestamps: true }
);

LeadSchema.pre("save", function (next) {
  this.fullName = `${this.firstName} ${this.lastName}`.trim();
  next();
});

LeadSchema.index({ agentId: 1, status: 1 });
LeadSchema.index({ fullName: "text", company: "text", email: "text" });

export const Lead: Model<ILead> =
  mongoose.models.Lead ?? mongoose.model<ILead>("Lead", LeadSchema);
