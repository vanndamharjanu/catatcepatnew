import * as webpush from "web-push";
import type { RecurringTemplate } from "./types";

export interface StoredPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface WebPushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

let vapidConfigured = false;

export function isWebPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim(),
  );
}

function ensureVapidConfigured() {
  if (vapidConfigured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || "";
  const subject =
    process.env.VAPID_SUBJECT?.trim() || "mailto:admin@catatcepat.web.id";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys belum dikonfigurasi.");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

/**
 * Returns recurring templates that are due on or before today's day-of-month
 * and have not yet been recorded in the current YYYY-MM month.
 */
export function findDueRecurringItems(
  recurring: RecurringTemplate[],
  now: Date = new Date(),
): RecurringTemplate[] {
  if (!Array.isArray(recurring) || recurring.length === 0) return [];
  const todayDay = now.getDate();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return recurring.filter(
    (item) =>
      item &&
      typeof item.dayOfMonth === "number" &&
      item.dayOfMonth <= todayDay &&
      item.lastRecordedMonth !== monthPrefix,
  );
}

export async function sendWebPushNotification(
  sub: StoredPushSubscription,
  payload: WebPushPayload,
): Promise<{ ok: boolean; statusCode?: number }> {
  ensureVapidConfigured();
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      },
      JSON.stringify(payload),
    );
    return { ok: true };
  } catch (err) {
    const statusCode =
      typeof err === "object" && err !== null && "statusCode" in err
        ? Number((err as { statusCode?: number }).statusCode)
        : undefined;
    return { ok: false, statusCode };
  }
}
