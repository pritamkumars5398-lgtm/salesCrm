import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { defineModel } from "./define-model";

/** Product docs, FAQs and pricing the AI looks up when answering a lead. */
export interface IKnowledgeItem extends Document {
  agentId: Types.ObjectId;
  title: string;
  content: string;
  source: "text" | "file";
  createdAt: Date;
  updatedAt: Date;
}

const KnowledgeItemSchema = new Schema<IKnowledgeItem>(
  {
    agentId: { type: Schema.Types.ObjectId, ref: "Agent", required: true },
    title:   { type: String, required: true, trim: true },
    content: { type: String, required: true },
    source:  { type: String, enum: ["text", "file"], default: "text" },
  },
  { timestamps: true }
);

KnowledgeItemSchema.index({ agentId: 1, updatedAt: -1 });

export const KnowledgeItem: Model<IKnowledgeItem> = defineModel<IKnowledgeItem>("KnowledgeItem", KnowledgeItemSchema);
