import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type LeadStatus = "new" | "in_outreach" | "replied" | "meeting_booked" | "closed";
export type OutreachStatus = "none" | "pending" | "sending" | "sent" | "failed";
export type LeadSource = "LinkedIn" | "Google Maps" | "JustDial" | "Manual" | "Apify" | "Referral" | "LLM";
export type Channel = "email" | "whatsapp" | "sms" | "call";

export interface ILeadNote {
  _id?: Types.ObjectId;
  text: string;
  author: string;
  createdAt: Date;
}

export interface ILeadHistory {
  field: string;
  from: string;
  to: string;
  by: string;
  at: Date;
  note?: string;
}

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
  llmProvider?: string;
  channels: Channel[];
  status: LeadStatus;
  sequenceId?: Types.ObjectId;
  pipelineStage: "new" | "contacted" | "replied" | "qualified" | "closed";
  agentEnabled: boolean;
  outreachStatus: OutreachStatus;
  lastOutreachError?: string;
  lastContactedAt?: Date;
  outreachAttempts: number;
  /** soft-delete timestamp; null/absent = active, set = in Trash */
  deletedAt?: Date | null;
  whatsappLid?: string;
  website?: string;
  location?: string;
  notes: ILeadNote[];
  history: ILeadHistory[];
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
    source:        { type: String, enum: ["LinkedIn", "Google Maps", "JustDial", "Manual", "Apify", "Referral", "LLM"], default: "Manual" },
    llmProvider:   { type: String },
    channels:      [{ type: String, enum: ["email", "whatsapp", "sms", "call"] }],
    status:        { type: String, enum: ["new", "in_outreach", "replied", "meeting_booked", "closed"], default: "new" },
    sequenceId:    { type: Schema.Types.ObjectId, ref: "Sequence" },
    pipelineStage: { type: String, enum: ["new", "contacted", "replied", "qualified", "closed"], default: "new" },
    agentEnabled:  { type: Boolean, default: true },
    outreachStatus:    { type: String, enum: ["none", "pending", "sending", "sent", "failed"], default: "none" },
    lastOutreachError: { type: String },
    lastContactedAt:   { type: Date },
    outreachAttempts:  { type: Number, default: 0 },
    deletedAt:         { type: Date, default: null },
    whatsappLid:   { type: String, trim: true },
    website:       { type: String, trim: true },
    location:      { type: String, trim: true, default: "" },
    notes: [{
      text:      { type: String, required: true },
      author:    { type: String, default: "User" },
      createdAt: { type: Date, default: Date.now },
    }],
    history: [{
      field: { type: String },
      from:  { type: String },
      to:    { type: String },
      by:    { type: String, default: "User" },
      at:    { type: Date, default: Date.now },
      note:  { type: String },
    }],
  },
  { timestamps: true }
);

LeadSchema.pre("save", function (next) {
  this.fullName = `${this.firstName} ${this.lastName}`.trim();
  next();
});

LeadSchema.index({ agentId: 1, status: 1 });
LeadSchema.index({ agentId: 1, outreachStatus: 1 });
LeadSchema.index({ agentId: 1, deletedAt: 1 });
LeadSchema.index({ fullName: "text", company: "text", email: "text" });

// Delete the cached model if it exists to ensure HMR picks up schema changes like the new 'LLM' source enum
if (mongoose.models.Lead) {
  delete mongoose.models.Lead;
}
export const Lead: Model<ILead> = mongoose.model<ILead>("Lead", LeadSchema);
