import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Razorpay in test mode, through its REST API (no SDK). Used only when RAZORPAY_KEY_ID and
// RAZORPAY_KEY_SECRET are set; otherwise the built-in mock UPI flow is used.

export type RazorpayKeys = { keyId: string; keySecret: string };

/** Creates an order for the amount still to pay after the wallet. */
export async function createRazorpayOrder(keys: RazorpayKeys, input: { amountPaise: number; receipt: string }, fetchImpl: typeof fetch = fetch): Promise<{ id: string }> {
  const response = await fetchImpl("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount: input.amountPaise, currency: "INR", receipt: input.receipt.slice(0, 40), payment_capture: 1 }),
  });
  if (!response.ok) throw new Error(`Razorpay order failed with HTTP ${response.status}`);
  const body = (await response.json()) as { id?: unknown };
  if (typeof body.id !== "string") throw new Error("Razorpay order response had no id");
  return { id: body.id };
}

/** Checkout's handler signature: HMAC-SHA256 of "orderId|paymentId" with the key secret. */
export function verifyRazorpaySignature(input: { orderId: string; paymentId: string; signature: string }, keySecret: string): boolean {
  const expected = createHmac("sha256", keySecret).update(`${input.orderId}|${input.paymentId}`).digest("hex");
  const given = Buffer.from(input.signature, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
