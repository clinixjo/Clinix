/**
 * Chart colors — hex mirrors of the brand tokens in globals.css
 * (SVG chart libs need concrete values, not CSS vars in attributes).
 * Palette validated for lightness band, chroma, CVD separation, and
 * contrast against the white card surface (ΔE 15.0 — passing).
 * Keep in sync with the design tokens; single-hue usage only:
 * these charts encode magnitude, not category identity.
 */
export const CHART = {
  rose: "#d4537e", // brand-400 — primary series
  roseDeep: "#993556", // brand-600 — emphasis / darker step
  roseSoft: "#f4c0d1", // brand-100 — area fill base
  grid: "#eae7e1", // border token — recessive gridlines
  ink: "#2c2c2a", // text-primary
  inkMuted: "#6b6a64", // text-secondary
} as const;
