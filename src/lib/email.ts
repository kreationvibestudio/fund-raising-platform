import nodemailer from "nodemailer";

type DonationReceiptEmailInput = {
  donorEmail: string;
  donorFirstName: string;
  donorLastName: string;
  amountNaira: number;
  transactionReference: string;
  paidAt: string;
  campaignName: string;
  campaignUrl: string;
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(amount);

const requiredEnvKeys = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_EMAIL"] as const;

const getMissingEmailEnv = () =>
  requiredEnvKeys.filter((envKey) => !process.env[envKey]);

const getTransporter = () =>
  nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

export async function sendDonationReceiptEmail(input: DonationReceiptEmailInput) {
  const missingEnv = getMissingEmailEnv();
  if (missingEnv.length > 0) {
    throw new Error(`Missing SMTP environment variables: ${missingEnv.join(", ")}`);
  }

  const donorName = `${input.donorFirstName} ${input.donorLastName}`.trim();
  const formattedAmount = formatCurrency(input.amountNaira);
  const paidAt = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(input.paidAt));

  const subject = `Thank you for your donation to ${input.campaignName}`;

  const text = `Hi ${input.donorFirstName},

Thank you for your generous support of ${input.campaignName}.

Donation receipt summary:
- Donor name: ${donorName}
- Amount donated: ${formattedAmount}
- Transaction reference: ${input.transactionReference}
- Date paid: ${paidAt}

Your support is helping us move closer to our goal. You can continue sharing the campaign here:
${input.campaignUrl}

With gratitude,
${input.campaignName} Team`;

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 640px; margin: 0 auto; color: #111827;">
      <h2 style="margin-bottom: 8px;">Thank you for your donation, ${input.donorFirstName}.</h2>
      <p style="margin-top: 0;">We are truly grateful for your support of <strong>${input.campaignName}</strong>.</p>
      <div style="border: 1px solid #E5E7EB; border-radius: 10px; padding: 16px; background: #F9FAFB;">
        <h3 style="margin-top: 0;">Donation Receipt</h3>
        <p style="margin: 6px 0;"><strong>Donor:</strong> ${donorName}</p>
        <p style="margin: 6px 0;"><strong>Amount:</strong> ${formattedAmount}</p>
        <p style="margin: 6px 0;"><strong>Transaction Ref:</strong> ${input.transactionReference}</p>
        <p style="margin: 6px 0;"><strong>Date Paid:</strong> ${paidAt} (WAT)</p>
      </div>
      <p style="margin-top: 18px;">You can keep supporting by sharing the campaign with your network.</p>
      <p><a href="${input.campaignUrl}" style="color: #2563EB;">${input.campaignUrl}</a></p>
      <p style="margin-top: 24px;">With gratitude,<br/>${input.campaignName} Team</p>
    </div>
  `;

  const transporter = getTransporter();
  await transporter.sendMail({
    from: process.env.SMTP_FROM_EMAIL,
    to: input.donorEmail,
    subject,
    text,
    html,
  });
}
