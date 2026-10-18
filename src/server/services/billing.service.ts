import crypto from "crypto";
import { Organization } from "@/lib/models/Organization";
import { Payment, IPayment } from "@/lib/models/Payment";
import { PLANS, PlanId } from "@/lib/plans";
import { getOrganizationLimits } from "./workspace.service";

/**
 * Prepaid plans through Razorpay: each payment buys 30 days of a plan. When
 * the period ends the organization is back on Free until it pays again.
 *
 * A payment is applied exactly once, whichever arrives first — the browser's
 * checkout callback (/api/billing/verify) or Razorpay's webhook.
 */

export const PLAN_PERIOD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const API = "https://api.razorpay.com/v1";

export class BillingError extends Error {
  status: 400 | 402 | 403 | 404 | 409 | 502 | 503;
  constructor(status: BillingError["status"], message: string) {
    super(message);
    this.status = status;
  }
}

export function razorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
  return { keyId, keySecret, webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "", enabled: !!(keyId && keySecret) };
}

async function razorpay<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { keyId, keySecret, enabled } = razorpayConfig();
  if (!enabled) throw new BillingError(503, "Payments aren't set up yet (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing).");
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: { description?: string } }).error?.description || `Razorpay error ${res.status}`;
    throw new BillingError(502, msg);
  }
  return data as T;
}

function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Checkout callback signature: HMAC-SHA256(order_id|payment_id, key_secret). */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  const { keySecret } = razorpayConfig();
  if (!keySecret || !orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Webhook signature: HMAC-SHA256(raw body, webhook secret). */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const { webhookSecret } = razorpayConfig();
  if (!webhookSecret || !signature) return false;
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

export async function createPlanOrder(organizationId: string, userId: string, planId: PlanId) {
  if (planId === "free" || !PLANS[planId]) throw new BillingError(400, "Pick a paid plan.");
  const amount = PLANS[planId].priceINR * 100; // paise — always from our price list, never the browser
  const order = await razorpay<{ id: string; amount: number; currency: string }>("/orders", {
    method: "POST",
    body: {
      amount,
      currency: "INR",
      receipt: `org_${organizationId.slice(-12)}_${Date.now()}`,
      notes: { organizationId, planId },
    },
  });
  await Payment.create({
    organizationId, userId, planId, amount, currency: "INR", razorpayOrderId: order.id, status: "created",
  });
  return { orderId: order.id, amount, currency: "INR", keyId: razorpayConfig().keyId };
}

interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  error_description?: string;
}

/**
 * Make sure Razorpay really has the money for this order (capturing it if the
 * account doesn't auto-capture), then apply the plan period.
 */
export async function confirmPayment(orderId: string, paymentId: string): Promise<IPayment> {
  const record = await Payment.findOne({ razorpayOrderId: orderId });
  if (!record) throw new BillingError(404, "Unknown order.");
  if (record.status === "paid") return record;

  let payment = await razorpay<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`);
  if (payment.order_id !== orderId) throw new BillingError(400, "This payment belongs to a different order.");
  if (payment.amount !== record.amount || payment.currency !== record.currency) {
    throw new BillingError(400, "The paid amount doesn't match the plan price.");
  }
  if (payment.status === "authorized") {
    payment = await razorpay<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}/capture`, {
      method: "POST",
      body: { amount: record.amount, currency: record.currency },
    });
  }
  if (payment.status !== "captured") {
    await markPaymentFailed(orderId, payment.error_description || `Payment is ${payment.status}`);
    throw new BillingError(402, payment.status === "failed" ? "The payment failed." : `The payment is ${payment.status}, not completed.`);
  }
  return applyPayment(record, paymentId);
}

/**
 * Turn a captured payment into plan time. Same plan while still active →
 * extends from the current end date. Different plan → starts now, and the
 * unused value of the old plan is converted into extra days of the new one.
 */
async function applyPayment(record: IPayment, paymentId: string): Promise<IPayment> {
  // Claim first so the webhook and the checkout callback can't both apply it.
  const claimed = await Payment.findOneAndUpdate(
    { _id: record._id, status: { $ne: "paid" } },
    { $set: { status: "paid", razorpayPaymentId: paymentId } },
    { new: true },
  );
  if (!claimed) return (await Payment.findById(record._id))!;

  const orgId = String(record.organizationId);
  // Another payment for the same organization may land at the same moment —
  // only write if the expiry is still what we based our maths on.
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await getOrganizationLimits(orgId);
    const now = Date.now();
    const active = !current.expired && current.expiresAt && current.expiresAt.getTime() > now;
    let start = now;
    let creditedDays = 0;
    if (active && current.purchasedPlan === record.planId) {
      start = current.expiresAt!.getTime();
    } else if (active && current.purchasedPlan !== "free") {
      const remainingDays = (current.expiresAt!.getTime() - now) / DAY_MS;
      creditedDays = Math.floor(remainingDays * PLANS[current.purchasedPlan].priceINR / PLANS[record.planId].priceINR);
    }
    const end = new Date(start + (PLAN_PERIOD_DAYS + creditedDays) * DAY_MS);

    const updated = await Organization.findOneAndUpdate(
      { _id: orgId, planExpiresAt: current.expiresAt ?? null },
      { $set: { plan: record.planId, planExpiresAt: end } },
      { new: true },
    );
    if (updated) {
      return (await Payment.findByIdAndUpdate(
        record._id,
        { $set: { periodStart: new Date(start), periodEnd: end, creditedDays } },
        { new: true },
      ))!;
    }
  }
  throw new BillingError(409, "Couldn't apply the payment because the plan changed at the same time — it was received; contact support if your plan didn't update.");
}

export async function markPaymentFailed(orderId: string, reason: string) {
  await Payment.updateOne({ razorpayOrderId: orderId, status: "created" }, { $set: { status: "failed", failureReason: reason.slice(0, 300) } });
}

export function daysLeft(expiresAt: Date | null): number | null {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / DAY_MS));
}
