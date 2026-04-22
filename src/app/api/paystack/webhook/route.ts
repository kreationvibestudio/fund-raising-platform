import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { mapInsertPayloadToRow } from "@/lib/donations";
import { sendDonationReceiptEmail } from "@/lib/email";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type PaystackVerifyResponse = {
  status: boolean;
  message: string;
  data: {
    amount: number;
    reference: string;
    paid_at: string;
    status?: string;
    customer: {
      email: string;
      first_name: string | null;
      last_name: string | null;
    };
    metadata?: {
      first_name?: string;
      last_name?: string;
      message?: string;
      anonymous?: boolean;
    };
  };
};

function isValidPaystackSignature(body: string, signatureHeader: string, secretKey: string) {
  const digest = createHmac("sha512", secretKey).update(body).digest("hex");
  const expected = Buffer.from(digest, "hex");
  const received = Buffer.from(signatureHeader, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

async function verifyPaystackTransaction(reference: string, secretKey: string) {
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Paystack verification failed with status ${response.status}`);
  }

  const payload = (await response.json()) as PaystackVerifyResponse;
  if (!payload.status) {
    throw new Error(payload.message || "Paystack verification failed");
  }

  return payload.data;
}

export async function POST(request: NextRequest) {
  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
  const signature = request.headers.get("x-paystack-signature");
  const requestBody = await request.text();

  if (!paystackSecretKey) {
    return NextResponse.json(
      { success: false, message: "PAYSTACK_SECRET_KEY is missing." },
      { status: 500 },
    );
  }

  if (!signature || !isValidPaystackSignature(requestBody, signature, paystackSecretKey)) {
    return NextResponse.json({ success: false, message: "Invalid webhook signature." }, { status: 401 });
  }

  const eventPayload = JSON.parse(requestBody) as {
    event: string;
    data?: {
      reference?: string;
      customer?: {
        email?: string;
      };
    };
  };

  if (eventPayload.event !== "charge.success" || !eventPayload.data?.reference) {
    return NextResponse.json({ success: true, message: "Event ignored." });
  }

  try {
    const verified = await verifyPaystackTransaction(eventPayload.data.reference, paystackSecretKey);
    if (verified.status && verified.status !== "success") {
      return NextResponse.json({ success: true, message: "Payment not successful. Ignored." });
    }

    const donorEmail = verified.customer.email;
    const donorFirstName = verified.metadata?.first_name || verified.customer.first_name || "Donor";
    const donorLastName = verified.metadata?.last_name || verified.customer.last_name || "";
    const isAnonymous = Boolean(verified.metadata?.anonymous);
    const message =
      typeof verified.metadata?.message === "string" && verified.metadata.message.trim()
        ? verified.metadata.message.trim()
        : undefined;

    const supabase = createSupabaseServerClient();
    const { error: donationSaveError } = await supabase.from("donations").upsert(
      mapInsertPayloadToRow({
        firstName: isAnonymous ? "Anonymous" : donorFirstName,
        lastName: isAnonymous ? "Donor" : donorLastName,
        email: donorEmail,
        amount: verified.amount / 100,
        message,
        isAnonymous,
        source: "paystack",
        transactionReference: verified.reference,
        createdAt: verified.paid_at ?? new Date().toISOString(),
      }),
      { onConflict: "transaction_reference" },
    );

    if (donationSaveError) {
      throw donationSaveError;
    }

    await sendDonationReceiptEmail({
      donorEmail,
      donorFirstName,
      donorLastName,
      amountNaira: verified.amount / 100,
      transactionReference: verified.reference,
      paidAt: verified.paid_at,
      campaignName: process.env.CAMPAIGN_NAME ?? "Fund Raising Campaign",
      campaignUrl: process.env.NEXT_PUBLIC_CAMPAIGN_URL ?? "https://your-campaign-link.com",
    });

    return NextResponse.json({
      success: true,
      message: "Webhook processed and receipt email sent.",
    });
  } catch (error) {
    console.error("Paystack webhook processing error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Webhook processing failed.",
      },
      { status: 500 },
    );
  }
}
