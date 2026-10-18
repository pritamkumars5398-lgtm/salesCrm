import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { defineModel } from "./define-model";
import type { MemberRole } from "./Membership";

/** A pending seat for someone who may not have an account yet; consumed on signup/login. */
export interface IInvite extends Document {
  organizationId: Types.ObjectId;
  email: string;
  role: Exclude<MemberRole, "owner">;
  allWorkspaces: boolean;
  workspaceIds: Types.ObjectId[];
  invitedBy: Types.ObjectId;
  acceptedAt: Date | null;
  createdAt: Date;
}

const InviteSchema = new Schema<IInvite>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    email:          { type: String, required: true, lowercase: true, trim: true },
    role:           { type: String, enum: ["admin", "member"], default: "member" },
    allWorkspaces:  { type: Boolean, default: true },
    workspaceIds:   [{ type: Schema.Types.ObjectId, ref: "Agent" }],
    invitedBy:      { type: Schema.Types.ObjectId, ref: "User", required: true },
    acceptedAt:     { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

InviteSchema.index({ email: 1, acceptedAt: 1 });
InviteSchema.index({ organizationId: 1, email: 1 });

export const Invite: Model<IInvite> = defineModel<IInvite>("Invite", InviteSchema);
