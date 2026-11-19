import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  createCatatCepatSpreadsheet,
  encryptToken,
  exchangeCodeForTokens,
  fetchGoogleUserEmail,
  syncTransactionsToSheet,
} from "@/lib/google-sheets";
import { constantTimeEqual, SHEETS_OAUTH_STATE_COOKIE } from "@/lib/security";
import { isUnauthenticatedCloudRequest, readAsyncDb, writeAsyncDb } from "@/lib/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state") || "";
  const error = searchParams.get("error");
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(SHEETS_OAUTH_STATE_COOKIE)?.value || "";
  cookieStore.delete(SHEETS_OAUTH_STATE_COOKIE);

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/?sheets=cancelled`);
  }

  // Require an authenticated session in Cloud mode so OAuth tokens never fall back to local storage.
  const db = await readAsyncDb();
  if (isUnauthenticatedCloudRequest(db)) {
    return NextResponse.redirect(`${appUrl}/?sheets=auth_required`);
  }

  if (!expectedState || !state || !constantTimeEqual(state, expectedState)) {
    db.sheetConnection.lastError =
      "Sesi keamanan Google Sheets tidak cocok atau kedaluwarsa. Silakan ulangi hubungkan.";
    await writeAsyncDb(db);
    return NextResponse.redirect(`${appUrl}/?sheets=error`);
  }

  try {
    const grantedScope = searchParams.get("scope") || "";
    if (grantedScope && !grantedScope.includes("drive.file")) {
      throw new Error(
        "Izin akses Google Drive belum dicentang di layar persetujuan Google. Silakan ulangi dan centang kotak izin file Google Drive sebelum klik Lanjutkan.",
      );
    }

    const { accessToken, refreshToken } = await exchangeCodeForTokens(code);
    const email = await fetchGoogleUserEmail(accessToken);
    const sheet = await createCatatCepatSpreadsheet(accessToken);

    db.sheetConnection = {
      configured: true,
      connected: true,
      googleEmail: email,
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl: sheet.spreadsheetUrl,
      sheetTabName: "Transaksi",
      sheetTabId: sheet.sheetTabId,
      encryptedRefreshToken: refreshToken
        ? encryptToken(refreshToken)
        : db.sheetConnection.encryptedRefreshToken,
      lastSyncedAt: new Date().toISOString(),
      lastError: undefined,
      pendingDeletes: [],
    };

    if (db.transactions.length > 0 && db.sheetConnection.encryptedRefreshToken) {
      await syncTransactionsToSheet(db.sheetConnection, db.transactions, db.accounts);
      db.transactions = db.transactions.map((t) => ({ ...t, sheetSyncStatus: "synced" }));
    }

    await writeAsyncDb(db);
    return NextResponse.redirect(`${appUrl}/?sheets=connected`);
  } catch (err) {
    const latest = await readAsyncDb();
    if (!isUnauthenticatedCloudRequest(latest)) {
      latest.sheetConnection.lastError =
        err instanceof Error ? err.message : "Gagal menghubungkan Google Sheets";
      await writeAsyncDb(latest);
    }
    return NextResponse.redirect(`${appUrl}/?sheets=error`);
  }
}
