import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-campaign",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Road to HoR 2027 | Akhakon Anenih A.A.",
  description:
    "Fundraising for Akhakon Anenih A.A. — Member House of Representatives, Esan North East / South East Federal Constituency.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${montserrat.variable} h-full antialiased`}>
      <body className="campaign-body min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
