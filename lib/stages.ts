/**
 * Stage configuration, copy, and ranges for the Hero component.
 */

export interface StageData {
  id: number;
  eyebrow: string;
  headline?: string; // Italic words marked with *word*
  subline: string;
  specs: string[]; // Three short facts per stage
  isWordmark?: boolean;
  startFrame: number;
  endFrame: number;
}

export const BRAND_NAME = "VARK";
export const ACCENT_COLOR = "#D97736"; // Warm terracotta accent

// Time-based stage duration in seconds
export const STAGE_DURATION_SECONDS = 7;
export const STAGE_DURATION = STAGE_DURATION_SECONDS;

export const STAGES: StageData[] = [
  {
    id: 0,
    eyebrow: "01 · PLACEMENT",
    headline: "Engineered for the *daily* carry.",
    subline: "Matte-coated canvas, reinforced seams, and balanced weight distribution.",
    specs: ["900D CANVAS", "24L CAPACITY", "840G TARE"],
    startFrame: 0,
    endFrame: 189,
  },
  {
    id: 1,
    eyebrow: "02 · UTILITY",
    headline: "Quick access, *organized* precision.",
    subline: "Dual weather-sealed zippers reveal dedicated sleeves for pens and tools.",
    specs: ["YKK AQUAGUARD", "DUAL STOWAGE", "MAGNETIC CLASP"],
    startFrame: 190,
    endFrame: 379,
  },
  {
    id: 2,
    eyebrow: "03 · CARGO",
    headline: "Spacious *main* cargo bay.",
    subline: "Padded 16-inch laptop chamber cradles notebooks, hardware, and essentials.",
    specs: ["16\" SLEEVE", "EVA FOAM", "FLAT-LAY ACCESS"],
    startFrame: 380,
    endFrame: 569,
  },
  {
    id: 3,
    eyebrow: "04 · HERITAGE",
    subline: "Form follows schoolwork. Built for years of study.",
    specs: ["LIFETIME CRAFT", "WEATHERPROOF", "MODULAR FIT"],
    isWordmark: true,
    startFrame: 569,
    endFrame: 569,
  },
];

export const TOTAL_FRAMES = 570;
