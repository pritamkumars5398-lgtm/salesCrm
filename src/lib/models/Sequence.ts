import mongoose, { Schema, Document, Model, Types } from "mongoose";
import type { Channel } from "./Lead";

export interface ISequenceStep {
  order: number;
  channel: Channel;
  dayOffset: number;
  sendTime: string;
}

export interface ISequence extends Document {
  agentId: Types.ObjectId;
  name: string;
  steps: ISequenceStep[];
  afterNoReply: "stop" | "restart" | "notify";
  createdAt: Date;
  updatedAt: Date;
}

const SequenceStepSchema = new Schema<ISequenceStep>(
  {
    order:     { type: Number, required: true },
    channel:   { type: String, enum: ["email", "whatsapp", "sms", "call"], required: true },
    dayOffset: { type: Number, required: true, min: 1 },
    sendTime:  { type: String, required: true },
  },
  { _id: false }
);

const SequenceSchema = new Schema<ISequence>(
  {
    agentId:      { type: Schema.Types.ObjectId, ref: "Agent", required: true },
    name:         { type: String, required: true, trim: true },
    steps:        [SequenceStepSchema],
    afterNoReply: { type: String, enum: ["stop", "restart", "notify"], default: "stop" },
  },
  { timestamps: true }
);

export const Sequence: Model<ISequence> =
  mongoose.models.Sequence ?? mongoose.model<ISequence>("Sequence", SequenceSchema);
