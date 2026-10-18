/** Loads Razorpay Checkout on demand and opens it for one order. */

interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: "payment.failed", cb: (resp: { error?: { description?: string } }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        loading = null;
        reject(new Error("Couldn't load Razorpay. Check your internet connection or ad blocker."));
      };
      document.body.appendChild(s);
    });
  }
  return loading;
}

export interface CheckoutOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  name: string;
  description: string;
  prefill: { name: string; email: string };
}

/**
 * Resolves with Razorpay's ids + signature when the payment succeeds, or null
 * if the buyer closed the window. A failed attempt is reported through
 * `onAttemptFailed` — the buyer can retry in the same window, so it doesn't end the checkout.
 */
export async function openRazorpayCheckout(
  order: CheckoutOrder,
  onAttemptFailed?: (reason: string) => void,
): Promise<RazorpaySuccess | null> {
  await loadScript();
  if (!window.Razorpay) throw new Error("Razorpay didn't load.");
  return new Promise((resolve, reject) => {
    let settled = false;
    const rzp = new window.Razorpay!({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.orderId,
      name: order.name,
      description: order.description,
      prefill: order.prefill,
      theme: { color: "#df2a2a" },
      handler: (resp: RazorpaySuccess) => {
        settled = true;
        resolve(resp);
      },
      modal: {
        ondismiss: () => { if (!settled) resolve(null); },
      },
    });
    rzp.on("payment.failed", (resp) => {
      onAttemptFailed?.(resp.error?.description || "The payment failed.");
    });
    try {
      rzp.open();
    } catch (err) {
      reject(err);
    }
  });
}
