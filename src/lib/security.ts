import { timingSafeEqual } from "node:crypto";

const RATE_BUCKET = new Map<string, { count: number; resetAt: number }>();
const MAX_BUCKETS = 2000;

/** Escape leading formula characters to prevent spreadsheet/CSV formula injection. */
export function sanitizeSpreadsheetCell(value: string): string {
  const str = String(value ?? "");
  if (/^\s*[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/** Extract best-effort client IP from reverse proxy headers for rate limiting. */
export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** In-memory fixed-window rate limiter with bounded map size (zero external deps). */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  if (RATE_BUCKET.size > MAX_BUCKETS) {
    for (const [k, entry] of RATE_BUCKET.entries()) {
      if (entry.resetAt <= now) RATE_BUCKET.delete(k);
    }
    if (RATE_BUCKET.size > MAX_BUCKETS) {
      RATE_BUCKET.clear();
    }
  }

  const existing = RATE_BUCKET.get(key);
  if (!existing || existing.resetAt <= now) {
    RATE_BUCKET.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: Math.max(0, limit - 1), retryAfterSec: 0 };
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { ok: true, remaining: Math.max(0, limit - existing.count), retryAfterSec: 0 };
}

/** Constant-time string equality check for OAuth state/tokens. */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export const SHEETS_OAUTH_STATE_COOKIE = "cc_sheets_oauth_state";

/** Standard secure cookie options for auth and OAuth state cookies. */
export function secureCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
