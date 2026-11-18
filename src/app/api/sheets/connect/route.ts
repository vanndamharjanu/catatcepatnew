import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { buildGoogleAuthUrl } from "@/lib/google-sheets";

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

  const state = randomUUID();
  const url = buildGoogleAuthUrl(state);
  return NextResponse.json({ configured: true, url });
}
