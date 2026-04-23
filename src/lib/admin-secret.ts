import { timingSafeEqual } from "node:crypto";

/**
 * Normalizes secrets copied from dashboards (Render, .env, PDFs): trims whitespace,
 * removes zero-width characters, and strips a single layer of matching ASCII quotes
 * if the whole value was wrapped in them.
 */
export function normalizeAdminSecretInput(value: string): string {
  let s = value.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  if (s.length >= 2) {
    const q = s[0];
    if ((q === '"' || q === "'") && s[s.length - 1] === q) {
      s = s.slice(1, -1).trim();
    }
  }
  return s;
}

/** Constant-time string compare for admin manual-donation header. */
export function isAdminManualSecretValid(provided: string, expected: string): boolean {
  const p = normalizeAdminSecretInput(provided);
  const e = normalizeAdminSecretInput(expected);
  if (!p || !e) {
    return false;
  }
  try {
    const a = Buffer.from(p, "utf8");
    const b = Buffer.from(e, "utf8");
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
