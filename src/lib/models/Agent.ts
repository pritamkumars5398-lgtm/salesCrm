import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { defineModel } from "./define-model";

/**
 * A workspace: one business line of an organization (e.g. "IT Services",
 * "Hotel CRM"), with its own leads, settings, AI playbook and schedules.
 * Kept under the historical "Agent" name — every collection references agentId.
 */
export interface IAgent extends Document {
  name: string;
  status: "active" | "inactive";
  leadCount: number;
  /** absent only on workspaces created before organizations existed (migrated at the owner's next login) */
  organizationId?: Types.ObjectId;
  /** template the workspace was created from (it_services, saas_product, ...) */
  businessTemplate?: string;
  /** creator's email; kept for the superadmin view and legacy migration */
  userEmail?: string;
  /** deleted workspaces keep a tombstone so the organization's monthly usage still counts what they spent */
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const AgentSchema = new Schema<IAgent>(
  {
    name:             { type: String, required: true, trim: true },
    status:           { type: String, enum: ["active", "inactive"], default: "inactive" },
    leadCount:        { type: Number, default: 0 },
    organizationId:   { type: Schema.Types.ObjectId, ref: "Organization" },
    businessTemplate: { type: String, default: "" },
    userEmail:        { type: String, trim: true, lowercase: true },
    deletedAt:        { type: Date, default: null },
  },
  { timestamps: true }
);

AgentSchema.index({ userEmail: 1 });
AgentSchema.index({ organizationId: 1 });

export const Agent: Model<IAgent> = defineModel<IAgent>("Agent", AgentSchema);
