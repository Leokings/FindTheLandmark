import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Find the Landmark — The world is your gameboard",
  description: "A fast daily landmark game with first-proof photo hunts settled by GenLayer.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "Find the Landmark",
    description: "Name famous places. Race to find the proof.",
    type: "website",
    images: [{ url: "/og.png", width: 1706, height: 909, alt: "A playful collage of world landmarks" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Find the Landmark",
    description: "Name famous places. Race to find the proof.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
