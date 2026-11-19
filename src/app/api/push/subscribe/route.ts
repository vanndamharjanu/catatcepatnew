import { NextResponse } from "next/server";
import { getActiveSessionFromCookies } from "@/lib/supabase";
import type { RecurringTemplate } from "@/lib/types";
import { isWebPushConfigured, sendWebPushNotification } from "@/lib/web-push";

function getSupabaseRestConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "") || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return { url, anonKey };
}

export async function POST(request: Request) {
  try {
    const session = await getActiveSessionFromCookies();
    if (!session) {
      return NextResponse.json(
        { error: "Silakan masuk terlebih dahulu." },
        { status: 401 },
      );
    }

    const body = (await request.json()) as {
      subscription?: {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      recurring?: RecurringTemplate[];
      sendTest?: boolean;
    };

    const endpoint = body.subscription?.endpoint?.trim() || "";
    const p256dh = body.subscription?.keys?.p256dh?.trim() || "";
    const auth = body.subscription?.keys?.auth?.trim() || "";

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: "Data langganan push tidak valid." },
        { status: 400 },
      );
    }

    const { url, anonKey } = getSupabaseRestConfig();
    if (!url || !anonKey) {
      return NextResponse.json(
        { error: "Konfigurasi Supabase belum lengkap." },
        { status: 500 },
      );
    }

    const recurring = Array.isArray(body.recurring)
      ? body.recurring.slice(0, 50)
      : [];

    const res = await fetch(
      `${url}/rest/v1/push_subscriptions?on_conflict=endpoint`,
      {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          user_id: session.user.id,
          endpoint,
          p256dh,
          auth,
          recurring_json: recurring,
          updated_at: new Date().toISOString(),
        }),
      },
    );

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: `Gagal menyimpan langganan push: ${detail.slice(0, 120)}` },
        { status: 500 },
      );
    }

    if (body.sendTest && isWebPushConfigured()) {
      await sendWebPushNotification(
        { endpoint, p256dh, auth },
        {
          title: "Notifikasi CatatCepat Aktif!",
          body: "Pengingat jadwal transaksi rutin bulanan akan dikirim ke perangkat ini.",
          url: "/",
          tag: "catatcepat-test",
        },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Gagal memproses langganan notifikasi.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getActiveSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { endpoint?: string };
    const endpoint = body.endpoint?.trim() || "";
    if (!endpoint) {
      return NextResponse.json(
        { error: "Endpoint tidak valid." },
        { status: 400 },
      );
    }

    const { url, anonKey } = getSupabaseRestConfig();
    if (!url || !anonKey) {
      return NextResponse.json(
        { error: "Konfigurasi Supabase belum lengkap." },
        { status: 500 },
      );
    }

    await fetch(
      `${url}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&user_id=eq.${encodeURIComponent(session.user.id)}`,
      {
        method: "DELETE",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${session.accessToken}`,
        },
      },
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Gagal menghapus langganan notifikasi." },
      { status: 500 },
    );
  }
}
