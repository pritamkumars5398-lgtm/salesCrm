import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { defineModel } from "./define-model";

/**
 * One phone call attempt. Created when a call is dispatched, then advanced by
 * Plivo callbacks (ring / answer / hangup / recording) and the telephony bridge
 * (transcript). `active` is true until the call reaches a terminal status and
 * backs a partial unique index so a lead can never be dialed twice at once.
 */
export type CallStatus =
  | "queued" | "ringing" | "in_progress"
  | "completed" | "no_answer" | "busy" | "failed" | "canceled" | "voicemail" | "logged";

export const ACTIVE_CALL_STATUSES: CallStatus[] = ["queued", "ringing", "in_progress"];

export interface ICallTurn {
  role: "agent" | "lead";
  content: string;
  timestamp: Date;
}

export interface ICall extends Document {
  agentId: Types.ObjectId;
  leadId?: Types.ObjectId | null;
  mode: "ai" | "manual";
  isTest: boolean;
  provider: "plivo" | "manual";
  to: string;
  from?: string;
  status: CallStatus;
  active: boolean;
  /** shared secret embedded in every callback URL for this call */
  token: string;
  requestUuid?: string;
  callUuid?: string;
  answeredAt?: Date;
  endedAt?: Date;
  durationSec?: number;
  billDurationSec?: number;
  hangupCause?: string;
  recordingUrl?: string;
  recordingDurationSec?: number;
  elevenConversationId?: string;
  transcript: ICallTurn[];
  summary?: string;
  sentiment?: "positive" | "neutral" | "negative";
  outcome?: string;
  error?: string;
  /** the user pressed "End call" in the CRM */
  endedByUser?: boolean;
  /** WhatsApp follow-up with our details (sent during or right after the call) */
  whatsappSentAt?: Date | null;
  whatsappError?: string;
  bridgeEndedAt?: Date;
  finalizedAt?: Date | null;
  /** full agent instructions + opening line, built from the workspace playbook when the call is placed */
  aiPrompt?: string;
  aiFirstMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CallTurnSchema = new Schema<ICallTurn>(
  {
    role:      { type: String, enum: ["agent", "lead"], required: true },
    content:   { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const CallSchema = new Schema<ICall>(
  {
    agentId:  { type: Schema.Types.ObjectId, ref: "Agent", required: true },
    leadId:   { type: Schema.Types.ObjectId, ref: "Lead", default: null },
    mode:     { type: String, enum: ["ai", "manual"], default: "ai" },
    isTest:   { type: Boolean, default: false },
    provider: { type: String, enum: ["plivo", "manual"], default: "plivo" },
    to:       { type: String, required: true },
    from:     { type: String },
    status: {
      type: String,
      enum: ["queued", "ringing", "in_progress", "completed", "no_answer", "busy", "failed", "canceled", "voicemail", "logged"],
      default: "queued",
    },
    active:   { type: Boolean, default: true },
    token:    { type: String, required: true, select: false },
    requestUuid: { type: String },
    callUuid:    { type: String },
    answeredAt:  { type: Date },
    endedAt:     { type: Date },
    durationSec:     { type: Number },
    billDurationSec: { type: Number },
    hangupCause:     { type: String },
    recordingUrl:         { type: String },
    recordingDurationSec: { type: Number },
    elevenConversationId: { type: String },
    transcript: [CallTurnSchema],
    summary:   { type: String },
    sentiment: { type: String, enum: ["positive", "neutral", "negative"] },
    outcome:   { type: String },
    error:     { type: String },
    endedByUser: { type: Boolean },
    whatsappSentAt: { type: Date, default: null },
    whatsappError:  { type: String },
    bridgeEndedAt: { type: Date },
    finalizedAt:   { type: Date, default: null },
    aiPrompt:       { type: String, select: false },
    aiFirstMessage: { type: String, select: false },
  },
  { timestamps: true }
);

CallSchema.index({ leadId: 1, createdAt: -1 });
CallSchema.index({ agentId: 1, createdAt: -1 });
CallSchema.index({ requestUuid: 1 });
// At most one in-flight call per lead (test calls have no lead and are exempt).
CallSchema.index(
  { leadId: 1, active: 1 },
  { unique: true, partialFilterExpression: { active: true, leadId: { $type: "objectId" } } }
);

export const Call: Model<ICall> = defineModel<ICall>("Call", CallSchema);
