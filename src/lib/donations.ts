export type Donation = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  amount: number;
  message?: string;
  isAnonymous: boolean;
  createdAt: string;
  source: "manual" | "paystack";
  transactionReference?: string;
};

export type DonationInsertPayload = {
  firstName: string;
  lastName: string;
  email?: string;
  amount: number;
  message?: string;
  isAnonymous: boolean;
  source: "manual" | "paystack";
  transactionReference?: string;
  createdAt?: string;
};

type DonationRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  amount: number;
  message: string | null;
  is_anonymous: boolean | null;
  created_at: string;
  source: "manual" | "paystack";
  transaction_reference: string | null;
};

export const mapDonationRow = (row: DonationRow): Donation => ({
  id: row.id,
  firstName: row.first_name,
  lastName: row.last_name,
  email: row.email ?? undefined,
  amount: row.amount,
  message: row.message ?? undefined,
  isAnonymous: Boolean(row.is_anonymous),
  createdAt: row.created_at,
  source: row.source,
  transactionReference: row.transaction_reference ?? undefined,
});

export const mapInsertPayloadToRow = (payload: DonationInsertPayload) => ({
  first_name: payload.firstName,
  last_name: payload.lastName,
  email: payload.email?.trim() ? payload.email.trim() : null,
  amount: payload.amount,
  message: payload.message ?? null,
  is_anonymous: payload.isAnonymous,
  source: payload.source,
  transaction_reference: payload.transactionReference ?? null,
  created_at: payload.createdAt ?? new Date().toISOString(),
});
