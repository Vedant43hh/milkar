"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { approvePartsAction } from "@/server/actions/orders";
import { confirmRazorpayAction, type CheckoutOutcome } from "@/server/actions/shop";
import { openRazorpay } from "../shop/razorpay";
import { Button } from "../ui/button";
import { useToast } from "../ui/toast";

/**
 * "Approve and pay": paid at once when the wallet covers it, otherwise on to the payment screen
 * (the test UPI screen, or Razorpay when it's set up) for the rest.
 */
export function ApprovePartsButton({ requestId, label }: { requestId: string; label: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  function done(outcome: CheckoutOutcome) {
    if (outcome.status === "DONE") {
      toast({ tone: "success", title: outcome.message });
      router.refresh();
    } else if (outcome.status === "REDIRECT") {
      router.push(outcome.url);
    } else if (outcome.status === "ERROR") {
      toast({ tone: "error", title: outcome.errors.join(" ") });
      router.refresh();
    } else {
      void openRazorpay({
        keyId: outcome.keyId,
        orderId: outcome.orderId,
        amountPaise: outcome.amountPaise,
        description: outcome.description,
        contact: outcome.contact,
        onPaid: (paid) => start(async () => done(await confirmRazorpayAction({ paymentId: outcome.paymentId, ...paid }))),
        onDismiss: () => undefined,
      });
    }
  }

  return (
    <Button type="button" loading={pending} icon={<Check aria-hidden className="size-4" />} onClick={() => start(async () => done(await approvePartsAction(requestId)))}>
      {label}
    </Button>
  );
}
