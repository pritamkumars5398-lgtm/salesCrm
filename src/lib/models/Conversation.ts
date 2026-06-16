import mongoose, { Schema, Document, Model, Types } from "mongoose";
import type { Channel } from "./Lead";

export interface IMessage {
  role: "agent" | "lead";
  content: string;
  timestamp: Date;
  meta?: Record<string, unknown>;
}

export interface IConversation extends Document {
  leadId: Types.ObjectId;
  agentId: Types.ObjectId;
  channel: Channel;
  messages: IMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    role:      { type: String, enum: ["agent", "lead"], required: true },
    content:   { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    meta:      { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const ConversationSchema = new Schema<IConversation>(
  {
    leadId:  { type: Schema.Types.ObjectId, ref: "Lead", required: true },
    agentId: { type: Schema.Types.ObjectId, ref: "Agent", required: true },
    channel: { type: String, enum: ["email", "whatsapp", "sms", "call"], required: true },
    messages: [MessageSchema],
  },
  { timestamps: true }
);

ConversationSchema.index({ leadId: 1, channel: 1 });

export const Conversation: Model<IConversation> =
  mongoose.models.Conversation ??
  mongoose.model<IConversation>("Conversation", ConversationSchema);
