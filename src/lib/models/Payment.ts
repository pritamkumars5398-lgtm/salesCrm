import { Schema, Document, Model, Types } from "mongoose";
import { defineModel } from "./define-model";
import type { PlanId } from "@/lib/plans";

/** One Razorpay checkout for a 30-day plan period. */
export interface IPayment extends Document {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  planId: Exclude<PlanId, "free">;
  /** in paise, fixed when the order was created */
  amount: number;
  currency: "INR";
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  status: "created" | "paid" | "failed";
  /** the plan period this payment bought (set when it is applied) */
  periodStart?: Date;
  periodEnd?: Date;
  /** days carried over from the unused part of a different plan */
  creditedDays?: number;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    organizationId:    { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    userId:            { type: Schema.Types.ObjectId, ref: "User", required: true },
    planId:            { type: String, enum: ["starter", "growth", "pro"], required: true },
    amount:            { type: Number, required: true },
    currency:          { type: String, default: "INR" },
    razorpayOrderId:   { type: String, required: true, unique: true },
    razorpayPaymentId: { type: String },
    status:            { type: String, enum: ["created", "paid", "failed"], default: "created" },
    periodStart:       { type: Date },
    periodEnd:         { type: Date },
    creditedDays:      { type: Number, default: 0 },
    failureReason:     { type: String },
  },
  { timestamps: true }
);

PaymentSchema.index({ organizationId: 1, createdAt: -1 });

export const Payment: Model<IPayment> = defineModel<IPayment>("Payment", PaymentSchema);
