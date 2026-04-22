"use client";

import { FormEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import Script from "next/script";
import { Donation } from "@/lib/donations";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";

const goalAmount = 5_000_000;
const paystackDonateUrl =
  process.env.NEXT_PUBLIC_PAYSTACK_DONATE_URL ?? "https://paystack.com";
const paystackPublicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "";
const campaignUrl =
  process.env.NEXT_PUBLIC_CAMPAIGN_URL ?? "https://your-campaign-link.com";
const presetAmounts = [1000, 5000, 10000, 20000, 50000];

declare global {
  interface Window {
    PaystackPop?: {
      setup: (options: {
        key: string;
        email: string;
        amount: number;
        currency?: string;
        ref?: string;
        metadata?: Record<string, unknown>;
        callback: (response: { reference: string }) => void;
        onClose?: () => void;
      }) => { openIframe: () => void };
    };
  }
}

const initialDonations: Donation[] = [];

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);

const formatDonationDate = (isoDate: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(isoDate));

export default function Home() {
  const [donations, setDonations] = useState(initialDonations);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedAmount, setSelectedAmount] = useState<number | null>(presetAmounts[1]);
  const [customAmount, setCustomAmount] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [message, setMessage] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<string>("");
  const [isLoadingDonations, setIsLoadingDonations] = useState(true);

  const totalDonated = useMemo(
    () => donations.reduce((sum, donation) => sum + donation.amount, 0),
    [donations],
  );
  const donorCount = useMemo(() => donations.length, [donations]);
  const progress = Math.min((totalDonated / goalAmount) * 100, 100);
  const remaining = Math.max(goalAmount - totalDonated, 0);
  const shareText = `I just supported this campaign! We have raised ${formatCurrency(totalDonated)} so far toward our goal of ${formatCurrency(goalAmount)}. Join us and donate today.`;
  const encodedCampaignUrl = encodeURIComponent(campaignUrl);
  const encodedShareText = encodeURIComponent(shareText);
  const shareLinks = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedCampaignUrl}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodedShareText}&url=${encodedCampaignUrl}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${campaignUrl}`)}`,
  };

  const getDonationAmount = () => {
    if (selectedAmount !== null) {
      return selectedAmount;
    }
    const parsedAmount = Number(customAmount);
    return Number.isFinite(parsedAmount) ? parsedAmount : NaN;
  };

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setSelectedAmount(presetAmounts[1]);
    setCustomAmount("");
    setIsAnonymous(false);
    setMessage("");
  };

  const addDonation = async (
    source: Donation["source"],
    transactionReference?: string,
    options?: { requireEmail?: boolean },
  ) => {
    const amount = getDonationAmount();
    const requireEmail = options?.requireEmail ?? false;
    if (!firstName || !lastName || Number.isNaN(amount) || amount <= 0) {
      return false;
    }
    if (requireEmail && !email.trim()) {
      return false;
    }

    const effectiveMessage = message.trim();
    const finalFirstName = isAnonymous ? "Anonymous" : firstName.trim();
    const finalLastName = isAnonymous ? "Donor" : lastName.trim();

    const response = await fetch("/api/donations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        firstName: finalFirstName,
        lastName: finalLastName,
        email: email.trim() || undefined,
        amount,
        message: effectiveMessage || undefined,
        isAnonymous,
        source,
        transactionReference,
      }),
    });

    if (!response.ok) {
      return false;
    }

    resetForm();
    return true;
  };

  const handleManualDonation = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const saved = await addDonation("manual");
    setPaymentStatus(saved ? "Donation recorded manually." : "Unable to save manual donation.");
  };

  const handlePaystackDonation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = getDonationAmount();
    if (!firstName || !lastName || !email || Number.isNaN(amount) || amount <= 0) {
      setPaymentStatus("Please provide valid donor details and donation amount.");
      return;
    }

    if (!window.PaystackPop || !paystackPublicKey) {
      setPaymentStatus("Paystack popup unavailable. Opening donation link in a new tab.");
      window.open(paystackDonateUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const ref = `don_${Date.now()}`;
    const handler = window.PaystackPop.setup({
      key: paystackPublicKey,
      email: email.trim(),
      amount: amount * 100,
      currency: "NGN",
      ref,
      metadata: {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        message: message.trim(),
        anonymous: isAnonymous,
      },
      callback: async (response) => {
        const saved = await addDonation("paystack", response.reference, { requireEmail: true });
        setPaymentStatus(
          saved
            ? "Payment successful. Thank you for your donation."
            : "Payment succeeded but donation could not be saved locally.",
        );
      },
      onClose: () => {
        setPaymentStatus("Payment popup closed.");
      },
    });

    handler.openIframe();
  };

  useEffect(() => {
    let isActive = true;
    const loadDonations = async () => {
      try {
        const response = await fetch("/api/donations", { cache: "no-store" });
        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => ({}))) as { message?: string };
          throw new Error(errorPayload.message ?? "Failed to fetch donations.");
        }
        const payload = (await response.json()) as { donations?: Donation[] };
        if (isActive && payload.donations) {
          setDonations(payload.donations);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (isActive) {
          setIsLoadingDonations(false);
        }
      }
    };

    loadDonations();

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      return () => {
        isActive = false;
      };
    }

    const channel = supabase
      .channel("realtime-donations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "donations" },
        () => {
          loadDonations();
        },
      )
      .subscribe();

    return () => {
      isActive = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-emerald-700">Community Campaign</p>
        <h1 className="mt-2 text-3xl font-bold text-black">Fund Raising Platform</h1>
        <p className="mt-3 text-sm text-zinc-600">
          Share this page on WhatsApp to keep everyone updated in real time.
        </p>
        <p className="mt-2 text-sm font-medium text-zinc-700">
          Raised so far: {formatCurrency(totalDonated)} / {formatCurrency(goalAmount)}
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Card label="Goal Amount" value={formatCurrency(goalAmount)} />
          <Card label="Total Donated" value={formatCurrency(totalDonated)} />
          <Card label="Donor Count" value={String(donorCount)} />
        </div>

        <div className="mt-5">
          <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full rounded-full bg-emerald-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-zinc-700">{progress.toFixed(1)}% of goal reached</p>
          <p className="mt-1 text-xs text-zinc-600">Remaining: {formatCurrency(remaining)}</p>
        </div>

        <a
          href={paystackDonateUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Donate with Paystack
        </a>

        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-600">
            Share this campaign
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={shareLinks.facebook}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
            >
              Share on Facebook
            </a>
            <a
              href={shareLinks.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
            >
              Share on Twitter
            </a>
            <a
              href={shareLinks.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
            >
              Share on WhatsApp
            </a>
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-black">Donor Wall</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Real-time donor feed with names, amounts, messages, and timestamps.
          </p>
          <ul className="mt-4 space-y-3">
            {isLoadingDonations ? (
              <li className="rounded-lg border border-zinc-200 p-3 text-sm text-zinc-600">
                Loading donor wall...
              </li>
            ) : donations.map((donation) => (
              <li
                key={donation.id}
                className="rounded-lg border border-zinc-200 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-black">
                      {donation.firstName} {donation.lastName}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {formatDonationDate(donation.createdAt)} UTC - {donation.source}
                    </p>
                  </div>
                  <p className="font-semibold text-emerald-700">{formatCurrency(donation.amount)}</p>
                </div>
                {donation.message ? (
                  <p className="mt-2 rounded-md bg-zinc-50 px-2 py-1 text-sm text-zinc-700">
                    &quot;{donation.message}&quot;
                  </p>
                ) : null}
                {donation.isAnonymous ? (
                  <p className="font-medium text-black">
                    Posted anonymously
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-black">Donation Form</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Pick a preset amount, enter a custom amount, and donate via Paystack popup.
          </p>
          <form onSubmit={handlePaystackDonation} className="mt-4 space-y-3">
            <input
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              placeholder="First name"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              required
            />
            <input
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              placeholder="Last name"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              required
            />
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email address"
              type="email"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              required
            />
            <div>
              <p className="mb-2 text-sm font-medium text-zinc-700">Preset amounts</p>
              <div className="flex flex-wrap gap-2">
                {presetAmounts.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setSelectedAmount(preset);
                      setCustomAmount("");
                    }}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      selectedAmount === preset
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                        : "border-zinc-300 text-zinc-700"
                    }`}
                  >
                    {formatCurrency(preset)}
                  </button>
                ))}
              </div>
            </div>
            <input
              value={customAmount}
              onChange={(event) => {
                setCustomAmount(event.target.value);
                setSelectedAmount(null);
              }}
              placeholder="Custom amount (NGN)"
              type="number"
              min="1"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Add a support message (optional)"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              rows={3}
            />
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(event) => setIsAnonymous(event.target.checked)}
              />
              Donate anonymously
            </label>
            <button
              type="submit"
              className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Donate with Paystack
            </button>
          </form>
          <div className="mt-3">
            <button
              type="button"
              onClick={handleManualDonation}
              className="w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100"
            >
              Record as Manual Donation
            </button>
          </div>
          {paymentStatus ? (
            <p className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-700">{paymentStatus}</p>
          ) : null}
        </div>
      </section>

      <Script src="https://js.paystack.co/v1/inline.js" strategy="afterInteractive" />
    </main>
  );
}

type CardProps = {
  label: string;
  value: string;
};

function Card({ label, value }: CardProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-black">{value}</p>
    </div>
  );
}
