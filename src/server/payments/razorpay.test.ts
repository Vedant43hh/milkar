import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createRazorpayOrder, verifyRazorpaySignature } from "./razorpay";

const secret = "test_secret";
const sign = (orderId: string, paymentId: string) => createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");

describe("Razorpay checkout signature", () => {
  it("accepts the signature Razorpay computes for this order and payment", () => {
    expect(verifyRazorpaySignature({ orderId: "order_1", paymentId: "pay_1", signature: sign("order_1", "pay_1") }, secret)).toBe(true);
  });

  it("rejects a signature for another payment, a wrong secret or garbage", () => {
    expect(verifyRazorpaySignature({ orderId: "order_1", paymentId: "pay_2", signature: sign("order_1", "pay_1") }, secret)).toBe(false);
    expect(verifyRazorpaySignature({ orderId: "order_1", paymentId: "pay_1", signature: sign("order_1", "pay_1") }, "other")).toBe(false);
    expect(verifyRazorpaySignature({ orderId: "order_1", paymentId: "pay_1", signature: "x" }, secret)).toBe(false);
  });
});

describe("createRazorpayOrder", () => {
  it("creates an INR order in paise with basic auth", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "order_ABC" }), { status: 200 }));
    const order = await createRazorpayOrder({ keyId: "rzp_test_1", keySecret: secret }, { amountPaise: 93000, receipt: "payment-1" }, fetchImpl as unknown as typeof fetch);
    expect(order).toEqual({ id: "order_ABC" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/orders");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from(`rzp_test_1:${secret}`).toString("base64")}`);
    expect(JSON.parse(String(init.body))).toEqual({ amount: 93000, currency: "INR", receipt: "payment-1", payment_capture: 1 });
  });

  it("fails loudly on an error response", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 401 }));
    await expect(createRazorpayOrder({ keyId: "k", keySecret: "s" }, { amountPaise: 100, receipt: "r" }, fetchImpl as unknown as typeof fetch)).rejects.toThrow(/401/);
  });
});
