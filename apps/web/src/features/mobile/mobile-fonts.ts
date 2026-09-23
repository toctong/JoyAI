import { Fraunces, Noto_Serif_SC } from "next/font/google";

/** English display / kickers — soft italic editorial feel. */
export const joyMobileKicker = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-joy-m-kicker",
  display: "swap",
});

/** Chinese page titles — refined serif with more art direction. */
export const joyMobileDisplay = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-joy-m-display",
  display: "swap",
  preload: true,
});
