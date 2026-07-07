/**
 * Money formatting for the app. Currency is Jordanian Dinar (JOD);
 * digits are always Latin (western) per the design system, regardless
 * of locale. Safe to call from both server and client components.
 */
export function formatCurrency(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "JOD",
    numberingSystem: "latn",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}
