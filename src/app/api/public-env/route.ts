import { NextResponse } from "next/server";

/**
 * Exposes non-secret Paystack + campaign URLs at request time so Render/Vercel
 * env vars work even if they were added after the last build (NEXT_PUBLIC_* is
 * often baked into the client bundle at build time).
 */
export async function GET() {
  const paystackPublicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY?.trim() ?? "";
  const paystackDonateUrl = process.env.NEXT_PUBLIC_PAYSTACK_DONATE_URL?.trim() ?? "";
  const campaignUrl = process.env.NEXT_PUBLIC_CAMPAIGN_URL?.trim() ?? "";

  return NextResponse.json(
    {
      paystackPublicKey,
      paystackDonateUrl,
      campaignUrl,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
