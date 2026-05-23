import type { Metadata } from "next";
import { Newsreader, Manrope } from "next/font/google";

const serif = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  icons: {
    icon: [
      { url: "/2bl/favicons/favicon.ico", sizes: "any" },
      { url: "/2bl/favicons/favicon.svg", type: "image/svg+xml" },
      { url: "/2bl/favicons/favicon-96x96.png", type: "image/png", sizes: "96x96" },
    ],
    apple: { url: "/2bl/favicons/apple-touch-icon.png" },
  },
  manifest: "/2bl/favicons/site.webmanifest",
};

export default function SBLLayout({ children }: { children: React.ReactNode }) {
  // data-brand="sbl" scopes the Second Brain Labs design tokens (globals.css) to this
  // route only, so they never collide with jefflougheed's global palette.
  return (
    <div data-brand="sbl" className={`${serif.variable} ${sans.variable}`}>
      {children}
    </div>
  );
}
