import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Payment } from "@/lib/models/Payment";
import { authorizeWorkspace } from "@/server/auth/access";
import { BillingError, confirmPayment, verifyCheckoutSignature } from "@/server/services/billing.service";

/**
 * POST { agentId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * Called by the checkout success handler. The signature proves Razorpay sent
 * these ids; the payment itself is then re-checked with Razorpay's API.
 */
export async function POST(req: Request) {
  try {
    await connectDB();
    const body = await req.json().catch(() => ({}));
    const access = await authorizeWorkspace(req, body.agentId);
    if (!access.ok) return access.response;
    const orderId = String(body.razorpay_order_id ?? "");
    const paymentId = String(body.razorpay_payment_id ?? "");
    if (!verifyCheckoutSignature(orderId, paymentId, String(body.razorpay_signature ?? ""))) {
      return NextResponse.json({ error: "Payment signature check failed." }, { status: 400 });
    }
    const record = await Payment.findOne({ razorpayOrderId: orderId }).lean();
    if (!record || String(record.organizationId) !== access.organizationId) {
      return NextResponse.json({ error: "Unknown order." }, { status: 404 });
    }
    const paid = await confirmPayment(orderId, paymentId);
    return NextResponse.json({ ok: true, planId: paid.planId, periodEnd: paid.periodEnd, creditedDays: paid.creditedDays ?? 0 });
  } catch (err) {
    if (err instanceof BillingError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[Billing] verify failed:", err);
    return NextResponse.json({ error: "Could not confirm the payment." }, { status: 500 });
  }
}
