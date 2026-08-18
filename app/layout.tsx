import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://find-the-landmark.vercel.app"),
  title: "Find the Landmark — Multiplayer map game",
  description: "Create a lobby and race up to 50 players through shared landmark rounds settled by GenLayer.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "Find the Landmark",
    description: "Make a lobby. Find the world. Top the game board.",
    type: "website",
    url: "/",
    images: [{ url: "/og.png", width: 1706, height: 909, alt: "A playful collage of world landmarks" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Find the Landmark",
    description: "Make a lobby. Find the world. Top the game board.",
    images: ["/og.png"],
  },
  alternates: { canonical: "/" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
