import { Fraunces, Source_Sans_3, IBM_Plex_Mono } from "next/font/google";

// Self-hosted at build time by next/font (no runtime request, no FOUT
// flash, works fully offline after build) — deliberately not the
// system-ui/Inter pairing nearly every AI-generated UI defaults to.
export const display = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display-raw",
  display: "swap",
});

export const body = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body-raw",
  display: "swap",
});

export const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-raw",
  display: "swap",
});
