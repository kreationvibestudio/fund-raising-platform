import { NextRequest, NextResponse } from "next/server";
import { isAdminManualSecretValid, normalizeAdminSecretInput } from "@/lib/admin-secret";
import { DonationInsertPayload, mapDonationRow, mapInsertPayloadToRow } from "@/lib/donations";
import { createSupabasePublicServerClient, createSupabaseServiceClient } from "@/lib/supabase-server";

function readAdminManualSecretFromEnv(): string {
  const raw = process.env.ADMIN_MANUAL_SECRET ?? process.env.admin_manual_secret;
  return raw ? normalizeAdminSecretInput(raw) : "";
}

function readProvidedAdminSecret(request: NextRequest): string {
  const fromHeader = request.headers.get("x-admin-secret");
  if (fromHeader) {
    return normalizeAdminSecretInput(fromHeader);
  }
  const auth = request.headers.get("authorization")?.trim() ?? "";
  const bearer = /^Bearer\s+(\S+)/i.exec(auth);
  if (bearer?.[1]) {
    return normalizeAdminSecretInput(bearer[1]);
  }
  return "";
}

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

    if (payload.source === "manual") {
      const expected = readAdminManualSecretFromEnv();
      if (!expected) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Manual donations are disabled. On Render set env ADMIN_MANUAL_SECRET (exact name; Linux is case-sensitive).",
          },
          { status: 503 },
        );
      }
      const provided = readProvidedAdminSecret(request);
      if (!isAdminManualSecretValid(provided, expected)) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Invalid admin secret. Match the Render value exactly (no extra spaces or quotes).",
          },
          { status: 401 },
        );
      }
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
    const errMsg = error instanceof Error ? error.message : "";
    if (errMsg.includes("Supabase service-role environment variables are missing")) {
      return NextResponse.json(
        {
          success: false,
          message: "Server is missing SUPABASE_SERVICE_ROLE_KEY (or URL); check Render environment.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { success: false, message: "Unable to create donation." },
      { status: 500 },
    );
  }
}
