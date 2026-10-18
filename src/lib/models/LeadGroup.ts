import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { defineModel } from "./define-model";
import type { GroupRule } from "@/lib/lead-fields";

/**
 * manual — leads are added/removed by hand (Lead.groupIds)
 * smart  — membership is computed from `rules` every time, so it is never stale
 */
export interface ILeadGroup extends Document {
  agentId: Types.ObjectId;
  name: string;
  color: string;
  kind: "manual" | "smart";
  match: "all" | "any";
  rules: GroupRule[];
  /** extra guidance the AI follows for leads in this group */
  playbook: string;
  createdAt: Date;
  updatedAt: Date;
}

const RuleSchema = new Schema<GroupRule>(
  {
    field: { type: String, required: true },
    op:    { type: String, required: true },
    value: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const LeadGroupSchema = new Schema<ILeadGroup>(
  {
    agentId:  { type: Schema.Types.ObjectId, ref: "Agent", required: true },
    name:     { type: String, required: true, trim: true },
    color:    { type: String, default: "#6366f1" },
    kind:     { type: String, enum: ["manual", "smart"], default: "manual" },
    match:    { type: String, enum: ["all", "any"], default: "all" },
    rules:    { type: [RuleSchema], default: [] },
    playbook: { type: String, default: "" },
  },
  { timestamps: true }
);

LeadGroupSchema.index({ agentId: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

export const LeadGroup: Model<ILeadGroup> = defineModel<ILeadGroup>("LeadGroup", LeadGroupSchema);
