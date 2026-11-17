import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Account, SheetConnection, Transaction } from "./types";

const OAUTH_SCOPE = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

function getEncryptionKey(): Buffer {
  const secret = process.env.APP_ENCRYPTION_SECRET || "catatcepat-dev-secret-change-in-production";
  return createHash("sha256").update(secret).digest();
}

export function encryptToken(plainText: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptToken(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Format token terenkripsi tidak valid");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function buildGoogleAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID belum dikonfigurasi di .env.local");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/api/sheets/callback`,
    response_type: "code",
    scope: OAUTH_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken?: string;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${appUrl}/api/sheets/callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gagal menukar OAuth code: ${errText}`);
  }

  const data = (await res.json()) as { access_token: string; refresh_token?: string };
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

async function refreshAccessToken(encryptedRefreshToken: string): Promise<string> {
  const refreshToken = decryptToken(encryptedRefreshToken);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error("Refresh token Google kedaluwarsa atau dicabut");
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function fetchGoogleUserEmail(accessToken: string): Promise<string | undefined> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return undefined;
  const info = (await res.json()) as { email?: string };
  return info.email;
}

/** Create user-owned CatatCepat spreadsheet via Sheets API v4 (compatible with drive.file scope). */
export async function createCatatCepatSpreadsheet(accessToken: string): Promise<{
  spreadsheetId: string;
  spreadsheetUrl: string;
}> {
  const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: { title: "CatatCepat - Laporan Keuangan Pribadi" },
      sheets: [{ properties: { title: "Transaksi", gridProperties: { frozenRowCount: 1 } } }],
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Gagal membuat spreadsheet: ${text}`);
  }

  const created = (await createRes.json()) as {
    spreadsheetId: string;
    spreadsheetUrl: string;
  };

  // Write canonical header row with Transaction UUID in column A
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${created.spreadsheetId}/values/Transaksi!A1:H1?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [
          ["Transaction ID", "Tanggal", "Jenis", "Kategori", "Akun", "Nominal", "Keterangan", "Diperbarui"],
        ],
      }),
    },
  );

  return {
    spreadsheetId: created.spreadsheetId,
    spreadsheetUrl: created.spreadsheetUrl,
  };
}

/** Format one transaction as a canonical 8-column row matching CatatCepat Sheet header. */
export function transactionToSheetRow(tx: Transaction, accounts: Account[]): string[] {
  const fromName = accounts.find((a) => a.id === tx.accountId)?.name || tx.accountId;
  const toName = tx.toAccountId ? accounts.find((a) => a.id === tx.toAccountId)?.name : "";
  const accountDisplay = tx.type === "Transfer" && toName ? `${fromName} -> ${toName}` : fromName;

  return [
    tx.id,
    tx.date,
    tx.type,
    tx.category,
    accountDisplay,
    String(tx.amount),
    tx.note,
    tx.updatedAt,
  ];
}

/** Push all local transactions cleanly to user's Google Sheet using Transaction ID upsert. */
export async function syncTransactionsToSheet(
  conn: SheetConnection,
  transactions: Transaction[],
  accounts: Account[],
): Promise<{ syncedCount: number }> {
  if (!conn.connected || !conn.encryptedRefreshToken || !conn.spreadsheetId) {
    throw new Error("Google Sheets belum terhubung");
  }

  const accessToken = await refreshAccessToken(conn.encryptedRefreshToken);
  const tab = conn.sheetTabName || "Transaksi";
  const rows = [
    ["Transaction ID", "Tanggal", "Jenis", "Kategori", "Akun", "Nominal", "Keterangan", "Diperbarui"],
    ...transactions.map((tx) => transactionToSheetRow(tx, accounts)),
  ];

  // Clear and batch-replace values cleanly so UUID stays authoritative
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${conn.spreadsheetId}/values/${encodeURIComponent(tab)}!A1:H:clear`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${conn.spreadsheetId}/values/${encodeURIComponent(tab)}!A1?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: rows }),
    },
  );

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    throw new Error(`Gagal sinkron ke Google Sheets: ${errText}`);
  }

  return { syncedCount: transactions.length };
}
