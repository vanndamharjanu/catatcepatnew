import { NextResponse } from "next/server";
import {
  createCatatCepatSpreadsheet,
  encryptToken,
  exchangeCodeForTokens,
  fetchGoogleUserEmail,
  syncTransactionsToSheet,
} from "@/lib/google-sheets";
import { readAsyncDb, writeAsyncDb } from "@/lib/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/?sheets=cancelled`);
  }

  try {
    const grantedScope = searchParams.get("scope") || "";
    if (grantedScope && !grantedScope.includes("drive.file")) {
      throw new Error(
        "Izin Google Drive (drive.file) belum dicentang di layar persetujuan Google. Silakan ulangi dan centang kotak izin file Google Drive sebelum klik Lanjutkan.",
      );
    }

    const { accessToken, refreshToken } = await exchangeCodeForTokens(code);
    const email = await fetchGoogleUserEmail(accessToken);
    const sheet = await createCatatCepatSpreadsheet(accessToken);

    const db = await readAsyncDb();
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
    const db = await readAsyncDb();
    db.sheetConnection.lastError =
      err instanceof Error ? err.message : "Gagal menghubungkan Google Sheets";
    await writeAsyncDb(db);
    return NextResponse.redirect(`${appUrl}/?sheets=error`);
  }
}
