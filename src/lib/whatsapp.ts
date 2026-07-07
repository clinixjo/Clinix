/**
 * Normalize a Jordanian phone/WhatsApp number to international digits
 * for wa.me. Handles: 07XXXXXXXX, 7XXXXXXXX, +962…, 00962…, 962….
 * Returns null when there aren't enough digits to be a real number.
 */
export function normalizeJordanPhone(raw: string | null): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("962")) {
    // already international
  } else if (digits.startsWith("0")) {
    digits = "962" + digits.slice(1);
  } else if (digits.length === 9 && digits.startsWith("7")) {
    digits = "962" + digits;
  }
  return digits.length >= 11 ? digits : null;
}

/** Build a wa.me deep link with a prefilled message, or null if unreachable. */
export function waLink(phone: string | null, message: string): string | null {
  const normalized = normalizeJordanPhone(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
