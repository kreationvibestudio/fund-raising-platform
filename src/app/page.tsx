"use client";

import Image from "next/image";
import {
  FormEvent,
  MouseEvent,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { manifesto } from "@/content/manifesto";
import { Donation } from "@/lib/donations";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";

const goalAmount = 5_000_000;
/** Build-time fallbacks; runtime values come from `/api/public-env` on the client. */
const paystackDonateUrlBuild = process.env.NEXT_PUBLIC_PAYSTACK_DONATE_URL?.trim() ?? "";
const paystackPublicKeyBuild = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY?.trim() ?? "";
const campaignUrlBuild = process.env.NEXT_PUBLIC_CAMPAIGN_URL?.trim() ?? "";

const isPaystackHostedPaymentUrl = (url: string) =>
  url.length > 0 && url.includes("paystack.com/pay");
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

type PublicEnvPayload = {
  paystackPublicKey: string;
  paystackDonateUrl: string;
  campaignUrl: string;
};

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
  const [adminManualOpen, setAdminManualOpen] = useState(false);
  const [adminManualSecret, setAdminManualSecret] = useState("");
  /** After mount, use the real browser URL so share links (especially WhatsApp) always include the correct campaign link. */
  const [sharePageUrl, setSharePageUrl] = useState<string | null>(null);
  const [isLoadingDonations, setIsLoadingDonations] = useState(true);
  const [publicEnv, setPublicEnv] = useState<PublicEnvPayload>({
    paystackPublicKey: paystackPublicKeyBuild,
    paystackDonateUrl: paystackDonateUrlBuild,
    campaignUrl: campaignUrlBuild || "https://your-campaign-link.com",
  });
  const paystackFormRef = useRef<HTMLFormElement>(null);

  const paystackPublicKey = publicEnv.paystackPublicKey.trim() || paystackPublicKeyBuild;
  const paystackDonateUrl = publicEnv.paystackDonateUrl.trim() || paystackDonateUrlBuild;
  const campaignUrl = publicEnv.campaignUrl.trim() || campaignUrlBuild || "https://your-campaign-link.com";
  const hostedPaystackFallbackUrl = isPaystackHostedPaymentUrl(paystackDonateUrl) ? paystackDonateUrl : "";

  const totalDonated = useMemo(
    () => donations.reduce((sum, donation) => sum + donation.amount, 0),
    [donations],
  );
  const donorCount = useMemo(() => donations.length, [donations]);
  const progress = Math.min((totalDonated / goalAmount) * 100, 100);
  const remaining = Math.max(goalAmount - totalDonated, 0);

  const shareLinks = useMemo(() => {
    const pageUrl = (sharePageUrl ?? campaignUrl).split("#")[0];
    const shareText = `I just supported this campaign! We have raised ${formatCurrency(totalDonated)} so far toward our goal of ${formatCurrency(goalAmount)}. Join us and donate today.`;
    const encodedCampaignUrl = encodeURIComponent(pageUrl);
    const encodedShareText = encodeURIComponent(shareText);
    const whatsappBody = `${shareText} ${pageUrl}`;
    return {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedCampaignUrl}`,
      twitter: `https://twitter.com/intent/tweet?text=${encodedShareText}&url=${encodedCampaignUrl}`,
      // wa.me click-to-chat (no phone) — opens WhatsApp with prefilled message
      whatsapp: `https://wa.me/?text=${encodeURIComponent(whatsappBody)}`,
    };
  }, [totalDonated, sharePageUrl, campaignUrl]);

  useEffect(() => {
    startTransition(() => {
      setSharePageUrl(window.location.href.split("#")[0]);
    });
  }, []);

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
    options?: { requireEmail?: boolean; adminSecret?: string },
  ): Promise<{ ok: boolean; message?: string }> => {
    const amount = getDonationAmount();
    const requireEmail = options?.requireEmail ?? false;
    if (!firstName || !lastName || Number.isNaN(amount) || amount <= 0) {
      return { ok: false, message: "Please fill in donor name and a valid amount." };
    }
    if (requireEmail && !email.trim()) {
      return { ok: false, message: "Email is required for Paystack donations." };
    }

    const effectiveMessage = message.trim();
    const finalFirstName = isAnonymous ? "Anonymous" : firstName.trim();
    const finalLastName = isAnonymous ? "Donor" : lastName.trim();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (source === "manual" && options?.adminSecret) {
      headers["x-admin-secret"] = options.adminSecret;
    }

    const response = await fetch("/api/donations", {
      method: "POST",
      headers,
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

    const data = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) {
      return {
        ok: false,
        message:
          data.message ??
          (response.status === 401 ? "Invalid admin secret." : "Unable to save donation."),
      };
    }

    resetForm();
    return { ok: true };
  };

  const handleManualDonation = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!adminManualSecret.trim()) {
      setPaymentStatus("Enter the admin secret to record a manual donation.");
      return;
    }
    const result = await addDonation("manual", undefined, { adminSecret: adminManualSecret.trim() });
    if (result.ok) {
      setAdminManualSecret("");
      setPaymentStatus("Donation recorded manually.");
    } else {
      setPaymentStatus(result.message ?? "Unable to save manual donation.");
    }
  };

  const waitForPaystackPop = (maxMs = 12000, stepMs = 80) =>
    new Promise<boolean>((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (typeof window !== "undefined" && window.PaystackPop) {
          resolve(true);
          return;
        }
        if (Date.now() - start >= maxMs) {
          resolve(false);
          return;
        }
        window.setTimeout(tick, stepMs);
      };
      tick();
    });

  const handlePaystackDonation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = getDonationAmount();
    if (!firstName || !lastName || !email || Number.isNaN(amount) || amount <= 0) {
      setPaymentStatus("Please provide valid donor details and donation amount.");
      return;
    }

    if (!paystackPublicKey) {
      setPaymentStatus(
        "Paystack public key is missing. Add NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY in Render (or .env.local), save, then redeploy with Clear build cache.",
      );
      return;
    }

    if (!window.PaystackPop) {
      setPaymentStatus("Loading Paystack checkout…");
      await waitForPaystackPop();
    }

    if (!window.PaystackPop) {
      if (hostedPaystackFallbackUrl) {
        setPaymentStatus("Opening your hosted Paystack payment page in a new tab.");
        window.open(hostedPaystackFallbackUrl, "_blank", "noopener,noreferrer");
      } else {
        setPaymentStatus(
          "Paystack could not load (blocked or offline). Refresh and try again, or add NEXT_PUBLIC_PAYSTACK_DONATE_URL with your https://paystack.com/pay/… page as fallback.",
        );
      }
      return;
    }

    const ref = `don_${Date.now()}`;
    // Paystack inline validates `callback` strictly — async arrow functions can fail
    // ("Attribute callback must be a valid function"). Use a plain function + .then().
    const handler = window.PaystackPop.setup({
      key: paystackPublicKey,
      email: email.trim(),
      amount: amount * 100,
      currency: "NGN",
      ref,
      metadata: {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        message: message.trim() || "",
        anonymous: isAnonymous ? "yes" : "no",
      },
      callback: function (response: { reference: string }) {
        void addDonation("paystack", response.reference, { requireEmail: true })
          .then((result) => {
            setPaymentStatus(
              result.ok
                ? "Payment successful. Thank you for your donation."
                : (result.message ?? "Payment succeeded but donation could not be saved locally."),
            );
          })
          .catch(() => {
            setPaymentStatus("Payment succeeded but recording the donation failed. Please contact support.");
          });
      },
      onClose: function () {
        setPaymentStatus("Payment popup closed.");
      },
    });

    handler.openIframe();
  };

  useEffect(() => {
    void fetch("/api/public-env", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: Partial<PublicEnvPayload>) => {
        setPublicEnv((previous) => ({
          paystackPublicKey: (data.paystackPublicKey ?? "").trim() || previous.paystackPublicKey,
          paystackDonateUrl: (data.paystackDonateUrl ?? "").trim() || previous.paystackDonateUrl,
          campaignUrl: (data.campaignUrl ?? "").trim() || previous.campaignUrl,
        }));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const form = paystackFormRef.current;
    if (!form) return;
    const paystackSrc = "https://js.paystack.co/v1/inline.js";
    if (form.querySelector(`script[src="${paystackSrc}"]`)) return;
    const script = document.createElement("script");
    script.src = paystackSrc;
    script.async = true;
    form.prepend(script);
  }, []);

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
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
      <section className="overflow-hidden rounded-2xl border border-[#0a2412] shadow-[0_20px_50px_-12px_rgba(0,45,21,0.35)]">
        <div className="flex flex-col-reverse bg-gradient-to-br from-[#002d15] via-[#0f2818] to-[#1a301f] lg:flex-row lg:items-stretch">
          <div className="flex flex-1 flex-col justify-center gap-5 p-6 sm:p-8 lg:max-w-[58%] lg:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/90 sm:text-sm">
              The Esan Peoples Project
            </p>
            <div>
              <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-[#00a859] sm:text-3xl lg:text-4xl">
                Akhakon Anenih A.A.
              </h1>
              <p className="mt-2 text-base font-bold text-[#f47920] sm:text-lg">
                For Member House of Representatives
              </p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-white/90 sm:text-base">
                Esan North East / South East Federal Constituency
              </p>
            </div>
            <div className="inline-flex w-fit items-center rounded-lg bg-[#f47920] px-4 py-2 text-sm font-bold text-white shadow-md">
              2027
            </div>
            <p className="text-sm font-medium text-white/95">
              Raised so far: {formatCurrency(totalDonated)} / {formatCurrency(goalAmount)}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Card label="Goal" value={formatCurrency(goalAmount)} />
              <Card label="Total raised" value={formatCurrency(totalDonated)} />
              <Card label="Donors" value={String(donorCount)} />
            </div>
            <div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-[#00a859] transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-white/90">{progress.toFixed(1)}% of goal</p>
              <p className="text-xs text-white/70">Remaining: {formatCurrency(remaining)}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href="#donate"
                className="inline-flex items-center justify-center rounded-lg bg-[#f47920] px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-[#e06a15]"
              >
                Donate with Paystack
              </a>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
                Share this campaign
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  href={shareLinks.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-white/30 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  Facebook
                </a>
                <a
                  href={shareLinks.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-white/30 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  Twitter / X
                </a>
                <a
                  href={shareLinks.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-white/30 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  WhatsApp
                </a>
              </div>
            </div>
          </div>
          <div className="relative min-h-[220px] w-full sm:min-h-[280px] lg:min-h-[420px] lg:w-[42%] lg:max-w-md lg:shrink-0">
            <Image
              src="/hero-campaign.png"
              alt="Akhakon Anenih A.A. campaign poster — Road to House of Representatives 2027"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 42vw"
              className="object-cover object-[center_top]"
            />
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#002d15]/80 via-transparent to-transparent lg:bg-gradient-to-l"
              aria-hidden
            />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="manifesto-heading"
        className="relative scroll-mt-8"
      >
        <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-[#f47920]/35 via-[#00a859]/20 to-[#002d15]/25 blur-sm" />
        <div className="relative overflow-hidden rounded-2xl border border-[#1a301f]/15 bg-white shadow-[0_12px_40px_-12px_rgba(0,45,21,0.18)]">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#00a859]/10" aria-hidden />
          <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-[#f47920]/10" aria-hidden />
          <div className="relative p-6 sm:p-8 lg:p-10">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#f47920]">
              {manifesto.kicker}
            </p>
            <h2
              id="manifesto-heading"
              className="mt-2 max-w-3xl text-2xl font-extrabold leading-tight tracking-tight text-[#1a301f] sm:text-3xl"
            >
              {manifesto.title}
            </h2>
            <p className="mt-3 max-w-2xl text-base font-semibold leading-relaxed text-[#002d15] sm:text-lg">
              {manifesto.subtitle}
            </p>
            <div className="mt-6 max-w-3xl space-y-4 text-sm leading-relaxed text-[#1a301f]/85 sm:text-base">
              {manifesto.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
            <div className="mt-8 rounded-xl border border-[#00a859]/25 bg-[#f6fbf8] p-5 sm:p-6">
              <p className="text-xs font-bold uppercase tracking-wide text-[#1a301f]/60">
                What your gift stands for
              </p>
              <ul className="mt-3 space-y-2.5">
                {manifesto.pledges.map((pledge, index) => (
                  <li key={index} className="flex gap-3 text-sm font-medium text-[#1a301f] sm:text-base">
                    <span
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#00a859] text-xs font-bold text-white"
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                    <span>{pledge}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-8 rounded-xl bg-gradient-to-br from-[#002d15] to-[#1a301f] p-5 text-white shadow-inner sm:p-6">
              <p className="text-base font-medium leading-relaxed text-white/95 sm:text-lg">
                {manifesto.closingLine}
              </p>
              <p className="mt-3 text-sm text-white/75">
                You have already seen our progress above—every additional donation pushes us closer to
                field work, outreach, and the infrastructure of a winning, service-driven mandate.
              </p>
              <a
                href="#donate"
                className="mt-5 inline-flex items-center justify-center rounded-lg bg-[#f47920] px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#e06a15]"
              >
                {manifesto.donateCtaLabel} →
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-[#1a301f]/20 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-[#1a301f]">Donor Wall</h2>
          <p className="mt-2 text-sm text-[#1a301f]/70">
            Real-time donor feed with names, amounts, messages, and timestamps.
          </p>
          <ul className="mt-4 space-y-3">
            {isLoadingDonations ? (
              <li className="rounded-lg border border-[#1a301f]/15 bg-[#eef2ef] p-3 text-sm text-[#1a301f]/70">
                Loading donor wall...
              </li>
            ) : donations.map((donation) => (
              <li
                key={donation.id}
                className="rounded-lg border border-[#1a301f]/12 bg-[#fafcfb] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#1a301f]">
                      {donation.firstName} {donation.lastName}
                    </p>
                    <p className="text-xs text-[#1a301f]/55">
                      {formatDonationDate(donation.createdAt)} UTC - {donation.source}
                    </p>
                  </div>
                  <p className="font-semibold text-[#00a859]">{formatCurrency(donation.amount)}</p>
                </div>
                {donation.message ? (
                  <p className="mt-2 rounded-md border border-[#1a301f]/10 bg-white px-2 py-1.5 text-sm text-[#1a301f]/85">
                    &quot;{donation.message}&quot;
                  </p>
                ) : null}
                {donation.isAnonymous ? (
                  <p className="mt-1 text-xs font-medium text-[#f47920]">Posted anonymously</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        <div id="donate" className="scroll-mt-8 rounded-2xl border border-[#1a301f]/20 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-[#1a301f]">Donation Form</h2>
          <p className="mt-2 text-sm text-[#1a301f]/70">
            Pick a preset amount, enter a custom amount, and donate via Paystack popup.
          </p>
          <form ref={paystackFormRef} onSubmit={handlePaystackDonation} className="mt-4 space-y-3">
            <input
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              placeholder="First name"
              className="w-full rounded-lg border border-[#1a301f]/20 bg-white px-3 py-2 text-sm text-[#1a301f] placeholder:text-[#1a301f]/40 focus:border-[#00a859] focus:outline-none focus:ring-2 focus:ring-[#00a859]/30"
              required
            />
            <input
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              placeholder="Last name"
              className="w-full rounded-lg border border-[#1a301f]/20 bg-white px-3 py-2 text-sm text-[#1a301f] placeholder:text-[#1a301f]/40 focus:border-[#00a859] focus:outline-none focus:ring-2 focus:ring-[#00a859]/30"
              required
            />
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email address"
              type="email"
              className="w-full rounded-lg border border-[#1a301f]/20 bg-white px-3 py-2 text-sm text-[#1a301f] placeholder:text-[#1a301f]/40 focus:border-[#00a859] focus:outline-none focus:ring-2 focus:ring-[#00a859]/30"
              required
            />
            <div>
              <p className="mb-2 text-sm font-semibold text-[#1a301f]">Preset amounts</p>
              <div className="flex flex-wrap gap-2">
                {presetAmounts.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setSelectedAmount(preset);
                      setCustomAmount("");
                    }}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                      selectedAmount === preset
                        ? "border-[#f47920] bg-[#fff4ed] text-[#c45a0f]"
                        : "border-[#1a301f]/20 text-[#1a301f] hover:border-[#00a859]/40"
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
              className="w-full rounded-lg border border-[#1a301f]/20 bg-white px-3 py-2 text-sm text-[#1a301f] placeholder:text-[#1a301f]/40 focus:border-[#00a859] focus:outline-none focus:ring-2 focus:ring-[#00a859]/30"
            />
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Add a support message (optional)"
              className="w-full rounded-lg border border-[#1a301f]/20 bg-white px-3 py-2 text-sm text-[#1a301f] placeholder:text-[#1a301f]/40 focus:border-[#00a859] focus:outline-none focus:ring-2 focus:ring-[#00a859]/30"
              rows={3}
            />
            <label className="flex items-center gap-2 text-sm text-[#1a301f]">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(event) => setIsAnonymous(event.target.checked)}
                className="rounded border-[#1a301f]/30 text-[#f47920] focus:ring-[#f47920]"
              />
              Donate anonymously
            </label>
            <button
              type="submit"
              className="w-full rounded-lg bg-[#f47920] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#e06a15]"
            >
              Donate with Paystack
            </button>
          </form>
          <div className="mt-6 border-t border-[#1a301f]/15 pt-5">
            <button
              type="button"
              onClick={() => setAdminManualOpen((open) => !open)}
              className="text-left text-xs font-bold uppercase tracking-wide text-[#1a301f]/60 underline-offset-2 hover:text-[#f47920] hover:underline"
            >
              {adminManualOpen ? "Hide" : "Show"} admin — manual / offline donation
            </button>
            {adminManualOpen ? (
              <div className="mt-4 rounded-xl border border-[#1a301f]/20 bg-[#fafcfb] p-4">
                <label className="block text-xs font-semibold uppercase tracking-wide text-[#1a301f]">
                  Admin secret
                </label>
                <input
                  type="password"
                  autoComplete="off"
                  value={adminManualSecret}
                  onChange={(event) => setAdminManualSecret(event.target.value)}
                  placeholder="Server admin secret"
                  className="mt-1 w-full rounded-lg border border-[#1a301f]/25 bg-white px-3 py-2 text-sm text-[#1a301f] placeholder:text-[#1a301f]/40 focus:border-[#00a859] focus:outline-none focus:ring-2 focus:ring-[#00a859]/25"
                />
                <button
                  type="button"
                  onClick={handleManualDonation}
                  className="mt-3 w-full rounded-lg border-2 border-[#1a301f]/30 bg-white px-4 py-2.5 text-sm font-semibold text-[#1a301f] transition hover:border-[#00a859]/50 hover:bg-[#eef2ef]"
                >
                  Record as Manual Donation
                </button>
              </div>
            ) : null}
          </div>
          {paymentStatus ? (
            <p className="mt-3 rounded-md border border-[#1a301f]/10 bg-[#eef2ef] px-3 py-2 text-sm text-[#1a301f]">
              {paymentStatus}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

type CardProps = {
  label: string;
  value: string;
};

function Card({ label, value }: CardProps) {
  return (
    <div className="rounded-xl border border-white/20 bg-white/10 p-3 backdrop-blur-sm sm:p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70 sm:text-xs">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-white sm:text-xl">{value}</p>
    </div>
  );
}
