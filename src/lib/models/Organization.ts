import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { defineModel } from "./define-model";
import type { PlanId } from "@/lib/plans";

/** The company that signed up. Owns its workspaces (one per business line), members and plan. */
export interface IOrganization extends Document {
  name: string;
  ownerUserId: Types.ObjectId;
  plan: PlanId;
  /**
   * End of the prepaid period for `plan` (Razorpay). Past this date the
   * organization is on Free until it pays again. null = no expiry
   * (Free, or a plan set by a superadmin).
   */
  planExpiresAt: Date | null;
  /** JSON overrides of plan limits, set by superadmin */
  customLimits?: string;
  /**
   * May fall back to the platform's own .env credentials (SMTP, Plivo,
   * ElevenLabs, Groq…) for anything it hasn't configured. Only organizations
   * migrated from before multi-tenancy (or switched on by a superadmin) —
   * a new company must never send from, or spend on, the platform's accounts.
   */
  usesPlatformCredentials: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSchema = new Schema<IOrganization>(
  {
    name:        { type: String, required: true, trim: true },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    plan:        { type: String, enum: ["free", "starter", "growth", "pro"], default: "free" },
    planExpiresAt: { type: Date, default: null },
    customLimits: { type: String, default: "" },
    usesPlatformCredentials: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// One owned organization per user — lets the signup/login upsert be race-free.
OrganizationSchema.index({ ownerUserId: 1 }, { unique: true });

export const Organization: Model<IOrganization> = defineModel<IOrganization>("Organization", OrganizationSchema);
