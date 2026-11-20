import { Schema } from "mongoose";
import { defineModel } from "./define-model";

export interface ISetupRequest {
  name: string;
  email: string;
  phone?: string;
  businessName?: string;
  businessWebsite?: string;
  businessServices?: string;
  docLink?: string;
  customPrompt?: string;
  status: "pending" | "contacted" | "completed" | "rejected";
  adminNotes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const SetupRequestSchema = new Schema<ISetupRequest>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    businessName: { type: String, trim: true },
    businessWebsite: { type: String, trim: true },
    businessServices: { type: String, trim: true },
    docLink: { type: String, trim: true },
    customPrompt: { type: String, trim: true },
    status: {
      type: String,
      enum: ["pending", "contacted", "completed", "rejected"],
      default: "pending",
      index: true,
    },
    adminNotes: { type: String },
  },
  { timestamps: true }
);

export const SetupRequest = defineModel<ISetupRequest>("SetupRequest", SetupRequestSchema);
