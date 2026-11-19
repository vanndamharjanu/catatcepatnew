import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildGoogleAuthUrl } from "@/lib/google-sheets";
import { secureCookieOptions, SHEETS_OAUTH_STATE_COOKIE } from "@/lib/security";
import { isUnauthenticatedCloudRequest, readAsyncDb } from "@/lib/store";

export async function GET() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      {
        configured: false,
        error: "Koneksi Google Sheets belum aktif di server ini.",
      },
      { status: 400 },
    );
  }

  const db = await readAsyncDb();
  if (isUnauthenticatedCloudRequest(db)) {
    return NextResponse.json(
      { error: "Silakan masuk ke akun Anda terlebih dahulu sebelum menghubungkan Google Sheets." },
      { status: 401 },
    );
  }

  const state = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(SHEETS_OAUTH_STATE_COOKIE, state, secureCookieOptions(60 * 10));

  const url = buildGoogleAuthUrl(state);
  return NextResponse.json({ configured: true, url });
}
