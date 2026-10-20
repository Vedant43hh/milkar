import "server-only";
import { getEnv, razorpayConfigured } from "@/lib/env";
import { createRazorpayOrder } from "./razorpay";

/** Where residents pay the part of an order their wallet doesn't cover. */
export interface PaymentGateway {
  readonly provider: "MOCK" | "RAZORPAY";
  createOrder(input: { paymentId: string; amountPaise: number }): Promise<{ providerOrderId: string }>;
}

/** Test UPI screen inside the app (/pay/<id>): pay or decline, nothing is charged. */
const mockGateway: PaymentGateway = {
  provider: "MOCK",
  async createOrder({ paymentId }) {
    return { providerOrderId: `mock_order_${paymentId}` };
  },
};

export function paymentGateway(): PaymentGateway {
  const env = getEnv();
  if (!razorpayConfigured(env)) return mockGateway;
  const keys = { keyId: env.RAZORPAY_KEY_ID!, keySecret: env.RAZORPAY_KEY_SECRET! };
  return {
    provider: "RAZORPAY",
    async createOrder({ paymentId, amountPaise }) {
      const order = await createRazorpayOrder(keys, { amountPaise, receipt: paymentId });
      return { providerOrderId: order.id };
    },
  };
}
