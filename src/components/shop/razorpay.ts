// Opens Razorpay Checkout (test mode) with UPI shown first. Loaded on demand, only when the server
// chose Razorpay because keys are configured.

type RazorpayResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };

type RazorpayOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: "INR";
  name: string;
  description: string;
  prefill: { contact: string };
  config: { display: { preferences: { show_default_blocks: boolean }; blocks: Record<string, unknown>; sequence: string[] } };
  handler: (response: RazorpayResponse) => void;
  modal: { ondismiss: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open(): void };
  }
}

const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Razorpay Checkout"));
    document.head.appendChild(script);
  });
}

export async function openRazorpay(input: {
  keyId: string;
  orderId: string;
  amountPaise: number;
  description: string;
  contact: string;
  onPaid: (response: { razorpayPaymentId: string; razorpayOrderId: string; signature: string }) => void;
  onDismiss: () => void;
}): Promise<void> {
  await loadScript();
  const Razorpay = window.Razorpay!;
  new Razorpay({
    key: input.keyId,
    order_id: input.orderId,
    amount: input.amountPaise,
    currency: "INR",
    name: "Milkar",
    description: input.description,
    prefill: { contact: input.contact },
    config: {
      display: {
        preferences: { show_default_blocks: true },
        blocks: { upi: { name: "UPI", instruments: [{ method: "upi" }] } },
        sequence: ["block.upi"],
      },
    },
    handler: (r) => input.onPaid({ razorpayPaymentId: r.razorpay_payment_id, razorpayOrderId: r.razorpay_order_id, signature: r.razorpay_signature }),
    modal: { ondismiss: input.onDismiss },
  }).open();
}
