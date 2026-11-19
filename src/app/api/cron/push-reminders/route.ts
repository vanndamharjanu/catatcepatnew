import { NextResponse } from "next/server";
import { formatRupiah } from "@/lib/finance";
import { constantTimeEqual } from "@/lib/security";
import type { RecurringTemplate } from "@/lib/types";
import {
  findDueRecurringItems,
  isWebPushConfigured,
  sendWebPushNotification,
} from "@/lib/web-push";

interface PushSubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  recurring_json: RecurringTemplate[];
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";
    if (!token || !constantTimeEqual(token, cronSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!isWebPushConfigured()) {
    return NextResponse.json(
      { ok: false, reason: "VAPID keys belum dikonfigurasi." },
      { status: 200 },
    );
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "") || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, reason: "SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi." },
      { status: 200 },
    );
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth,recurring_json`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: "Gagal membaca daftar langganan push." },
      { status: 500 },
    );
  }

  const rows = (await res.json()) as PushSubRow[];
  const now = new Date();
  let sent = 0;
  let removed = 0;

  for (const row of rows) {
    const due = findDueRecurringItems(row.recurring_json, now);
    if (due.length === 0) continue;

    const first = due[0];
    const body =
      due.length === 1
        ? `${first.name} (${formatRupiah(first.amount)}) jatuh tempo hari ini. Ketuk untuk catat 1 klik.`
        : `${first.name} (${formatRupiah(first.amount)}) + ${due.length - 1} jadwal rutin lainnya menunggu dicatat.`;

    const result = await sendWebPushNotification(
      { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth },
      {
        title: "Pengingat Jadwal Rutin CatatCepat",
        body,
        url: "/",
        tag: "catatcepat-recurring",
      },
    );

    if (result.ok) {
      sent += 1;
    } else if (result.statusCode === 404 || result.statusCode === 410) {
      removed += 1;
      await fetch(
        `${supabaseUrl}/rest/v1/push_subscriptions?id=eq.${encodeURIComponent(row.id)}`,
        {
          method: "DELETE",
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
        },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    checked: rows.length,
    sent,
    removed,
  });
}
