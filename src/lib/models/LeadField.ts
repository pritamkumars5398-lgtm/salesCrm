import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { defineModel } from "./define-model";
import type { LeadFieldType } from "@/lib/lead-fields";

/** A custom field a workspace tracks on its leads (Industry, Budget, Rooms…). */
export interface ILeadField extends Document {
  agentId: Types.ObjectId;
  key: string;
  label: string;
  type: LeadFieldType;
  options: string[];
  aiFill: boolean;
  description: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const LeadFieldSchema = new Schema<ILeadField>(
  {
    agentId:     { type: Schema.Types.ObjectId, ref: "Agent", required: true },
    key:         { type: String, required: true, trim: true },
    label:       { type: String, required: true, trim: true },
    type:        { type: String, enum: ["text", "number", "select", "multiselect", "boolean", "date"], required: true },
    options:     { type: [String], default: [] },
    aiFill:      { type: Boolean, default: false },
    description: { type: String, default: "" },
    order:       { type: Number, default: 0 },
  },
  { timestamps: true }
);

LeadFieldSchema.index({ agentId: 1, key: 1 }, { unique: true });

export const LeadField: Model<ILeadField> = defineModel<ILeadField>("LeadField", LeadFieldSchema);
