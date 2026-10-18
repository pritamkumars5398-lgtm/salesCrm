import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { BillingError, confirmPayment, markPaymentFailed, verifyWebhookSignature } from "@/server/services/billing.service";

/**
 * Razorpay webhook (Dashboard → Webhooks → https://<your-domain>/api/webhooks/razorpay,
 * events: payment.captured, order.paid, payment.failed; secret = RAZORPAY_WEBHOOK_SECRET).
 * Covers buyers who close the tab before the checkout callback runs.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let event: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; error_description?: string } } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const payment = event.payload?.payment?.entity;
  if (!payment?.id || !payment.order_id) return NextResponse.json({ ok: true, ignored: true });

  await connectDB();
  try {
    if (event.event === "payment.captured" || event.event === "order.paid") {
      await confirmPayment(payment.order_id, payment.id);
    } else if (event.event === "payment.failed") {
      await markPaymentFailed(payment.order_id, payment.error_description || "Payment failed");
    }
  } catch (err) {
    // Unknown orders (not ours) are acknowledged so Razorpay stops retrying; real errors are retried.
    if (err instanceof BillingError && err.status === 404) return NextResponse.json({ ok: true, ignored: true });
    console.error("[Razorpay webhook]", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
