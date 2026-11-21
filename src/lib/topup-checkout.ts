"use client";
import { apiPost } from "@/lib/api/client";
import { openRazorpayCheckout, type CheckoutOrder } from "@/lib/razorpay-checkout";
import { FEATURE_LABEL, findPack } from "@/lib/topups";

/** Tells usage banners/popups to reload after a purchase. */
export const USAGE_CHANGED_EVENT = "crm:usage-changed";

/**
 * Buy one top-up pack: Razorpay checkout (or instant in fake-payment mode), then confirm.
 * Returns true when the credits were added.
 */
export async function buyTopUp(agentId: string, packId: string, toast: (msg: string, type?: "success" | "error") => void): Promise<boolean> {
  const pack = findPack(packId);
  if (!pack) return false;
  const label = `${pack.units.toLocaleString("en-IN")} extra ${FEATURE_LABEL[pack.field].unit}`;
  try {
    const checkout = await apiPost<CheckoutOrder & { fake?: boolean }>("/api/billing/topup", { agentId, packId });
    if (checkout.fake) {
      toast(`${label} added (Fake Payment Mode).`, "success");
      window.dispatchEvent(new Event(USAGE_CHANGED_EVENT));
      return true;
    }
    const result = await openRazorpayCheckout(checkout, (reason) => toast(`Payment failed: ${reason} — you can try again in the same window.`, "error"));
    if (!result) {
      toast("Payment window closed — nothing was charged.");
      return false;
    }
    await apiPost("/api/billing/verify", { agentId, ...result });
    toast(`Payment received — ${label} added. They never expire.`, "success");
    window.dispatchEvent(new Event(USAGE_CHANGED_EVENT));
    return true;
  } catch (err) {
    // If money was taken but confirmation failed here, Razorpay's webhook still adds the credits.
    toast(err instanceof Error ? err.message : "Payment couldn't be completed.", "error");
    window.dispatchEvent(new Event(USAGE_CHANGED_EVENT));
    return false;
  }
}
