import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { defineModel } from "./define-model";

/**
 * owner  — everything, incl. deleting the organization and managing admins
 * admin  — settings, workspaces, members (not the owner), publishing
 * member — works leads/inbox/calls in the workspaces they are given; never sees API keys
 */
export type MemberRole = "owner" | "admin" | "member";

export interface IMembership extends Document {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  role: MemberRole;
  /** true = every workspace in the org, including ones created later */
  allWorkspaces: boolean;
  workspaceIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const MembershipSchema = new Schema<IMembership>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    userId:         { type: Schema.Types.ObjectId, ref: "User", required: true },
    role:           { type: String, enum: ["owner", "admin", "member"], default: "member" },
    allWorkspaces:  { type: Boolean, default: true },
    workspaceIds:   [{ type: Schema.Types.ObjectId, ref: "Agent" }],
  },
  { timestamps: true }
);

MembershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
MembershipSchema.index({ userId: 1 });

export const Membership: Model<IMembership> = defineModel<IMembership>("Membership", MembershipSchema);
