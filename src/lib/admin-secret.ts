import { timingSafeEqual } from "node:crypto";

/** Constant-time string compare for admin manual-donation header. */
export function isAdminManualSecretValid(provided: string, expected: string): boolean {
  try {
    const a = Buffer.from(provided, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
