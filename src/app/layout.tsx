import type { Metadata, Viewport } from "next";
import { Inter, League_Spartan } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const leagueSpartan = League_Spartan({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-league-spartan",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Ready. Set. Amen. — Keep the trip together.",
    template: "%s · Ready. Set. Amen.",
  },
  description:
    "The faith-first trip planner for church groups. Organize people, waivers, payments, vehicles, rooms, and every detail — then cover the trip in prayer.",
  applicationName: "Ready Set Amen",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#106B4D",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${leagueSpartan.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
