import { NextRequest, NextResponse } from "next/server";
import { DonationInsertPayload, mapDonationRow, mapInsertPayloadToRow } from "@/lib/donations";
import { createSupabasePublicServerClient, createSupabaseServiceClient } from "@/lib/supabase-server";

const DONATIONS_TABLE = "donations";

export async function GET() {
  try {
    // Reads should work with anon/public key under RLS policy.
    const supabase = createSupabasePublicServerClient();
    const { data, error } = await supabase
      .from(DONATIONS_TABLE)
      .select(
        "id, first_name, last_name, email, amount, message, is_anonymous, created_at, source, transaction_reference",
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, donations: (data ?? []).map(mapDonationRow) });
  } catch (error) {
    console.error("Failed to fetch donations:", error);
    return NextResponse.json(
      { success: false, message: "Unable to fetch donations." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as DonationInsertPayload;
    if (
      !payload.firstName ||
      !payload.lastName ||
      !Number.isFinite(payload.amount) ||
      payload.amount <= 0
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid donation payload." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServiceClient();
    const row = mapInsertPayloadToRow(payload);
    const { data, error } = await supabase
      .from(DONATIONS_TABLE)
      .insert(row)
      .select(
        "id, first_name, last_name, email, amount, message, is_anonymous, created_at, source, transaction_reference",
      )
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      donation: mapDonationRow(data),
    });
  } catch (error) {
    console.error("Failed to create donation:", error);
    return NextResponse.json(
      { success: false, message: "Unable to create donation." },
      { status: 500 },
    );
  }
}
