import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Account, AppDatabase, SheetConnection, Transaction } from "./types.ts";

const OAUTH_SCOPE = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export const SHEET_HEADERS = [
  "Transaction ID",
  "Tanggal",
  "Jenis",
  "Kategori",
  "Akun",
  "Nominal",
  "Keterangan",
  "Diperbarui",
];

const FULL_SYNC_CHUNK_SIZE = 2500;

// In-memory short-lived access token cache keyed by encrypted refresh token hash.
const accessTokenCache = new Map<string, { token: string; expiresAt: number }>();

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

function tokenCacheKey(encryptedRefreshToken: string): string {
  return createHash("sha256").update(encryptedRefreshToken).digest("hex");
}

async function getAccessToken(
  encryptedRefreshToken: string,
  forceRefresh = false,
): Promise<string> {
  const key = tokenCacheKey(encryptedRefreshToken);
  if (!forceRefresh) {
    const cached = accessTokenCache.get(key);
    if (cached && cached.expiresAt > Date.now() + 60_000) {
      return cached.token;
    }
  }

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
    accessTokenCache.delete(key);
    throw new Error("Refresh token Google kedaluwarsa atau dicabut");
  }
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  accessTokenCache.set(key, {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  });
  return data.access_token;
}

async function fetchGoogleWithAuth(
  encryptedRefreshToken: string,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  let token = await getAccessToken(encryptedRefreshToken, false);
  const withAuth = (t: string): RequestInit => ({
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${t}` },
  });
  let res = await fetch(url, withAuth(token));
  if (res.status === 401) {
    token = await getAccessToken(encryptedRefreshToken, true);
    res = await fetch(url, withAuth(token));
  }
  return res;
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
  sheetTabId?: number;
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
    if (/has not been used in project|SERVICE_DISABLED/i.test(text)) {
      throw new Error(
        "Google Sheets API atau Google Drive API belum diaktifkan (Enable) di Google Cloud Console project Anda.",
      );
    }
    if (/insufficient/i.test(text) || createRes.status === 403) {
      throw new Error(
        "Izin akses Google Drive / Sheets ditolak. Pastikan kotak izin drive.file dicentang saat persetujuan Google.",
      );
    }
    throw new Error(`Gagal membuat spreadsheet: ${text.slice(0, 180)}`);
  }

  const created = (await createRes.json()) as {
    spreadsheetId: string;
    spreadsheetUrl: string;
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
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
      body: JSON.stringify({ values: [SHEET_HEADERS] }),
    },
  );

  return {
    spreadsheetId: created.spreadsheetId,
    spreadsheetUrl: created.spreadsheetUrl,
    sheetTabId: created.sheets?.[0]?.properties?.sheetId,
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

/** Split matrix rows into bounded chunks so large ledgers never hit Sheets payload limits. */
export function chunkRows<T>(rows: T[], chunkSize: number = FULL_SYNC_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    chunks.push(rows.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Plan incremental sheet mutations from column A UUIDs:
 * 1) updates (using current row numbers before any shift),
 * 2) deletes (sorted descending so row indices don't shift each other),
 * 3) appends (brand-new UUIDs).
 */
export function buildIncrementalSyncPlan(
  sheetColumnA: string[],
  pendingTransactions: Transaction[],
  pendingDeletes: string[],
): {
  needsHeader: boolean;
  updates: Array<{ rowNumber1Based: number; tx: Transaction }>;
  deleteRowIndices0BasedDesc: number[];
  appends: Transaction[];
} {
  const needsHeader = sheetColumnA[0] !== SHEET_HEADERS[0];
  const rowByUuid = new Map<string, number>();
  for (let i = 1; i < sheetColumnA.length; i += 1) {
    const id = (sheetColumnA[i] || "").trim();
    if (id && !rowByUuid.has(id)) {
      rowByUuid.set(id, i + 1); // 1-based sheet row
    }
  }

  const activeIds = new Set(pendingTransactions.map((t) => t.id));
  const updates: Array<{ rowNumber1Based: number; tx: Transaction }> = [];
  const appends: Transaction[] = [];
  for (const tx of pendingTransactions) {
    const rowNum = rowByUuid.get(tx.id);
    if (rowNum) {
      updates.push({ rowNumber1Based: rowNum, tx });
    } else {
      appends.push(tx);
    }
  }

  const deleteRowIndices0BasedDesc = Array.from(new Set(pendingDeletes))
    .filter((id) => !activeIds.has(id))
    .map((id) => rowByUuid.get(id))
    .filter((rowNum): rowNum is number => typeof rowNum === "number")
    .map((rowNum) => rowNum - 1) // 0-based for deleteDimension
    .sort((a, b) => b - a);

  return { needsHeader, updates, deleteRowIndices0BasedDesc, appends };
}

async function resolveSheetTabId(conn: SheetConnection): Promise<number> {
  if (typeof conn.sheetTabId === "number") return conn.sheetTabId;
  if (!conn.encryptedRefreshToken || !conn.spreadsheetId) return 0;
  const tab = conn.sheetTabName || "Transaksi";
  const res = await fetchGoogleWithAuth(
    conn.encryptedRefreshToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${conn.spreadsheetId}?fields=sheets.properties`,
  );
  if (!res.ok) return 0;
  const meta = (await res.json().catch(() => ({}))) as {
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
  };
  const found =
    meta.sheets?.find((s) => s.properties?.title === tab)?.properties?.sheetId ??
    meta.sheets?.[0]?.properties?.sheetId ??
    0;
  conn.sheetTabId = found;
  return found;
}

async function readColumnA(conn: SheetConnection): Promise<string[]> {
  if (!conn.encryptedRefreshToken || !conn.spreadsheetId) return [];
  const tab = conn.sheetTabName || "Transaksi";
  const res = await fetchGoogleWithAuth(
    conn.encryptedRefreshToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${conn.spreadsheetId}/values/${encodeURIComponent(tab)}!A:A?majorDimension=COLUMNS`,
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gagal membaca indeks Google Sheets: ${errText}`);
  }
  const data = (await res.json()) as { values?: string[][] };
  return data.values?.[0] ?? [];
}

async function appendRows(
  conn: SheetConnection,
  rows: string[][],
): Promise<void> {
  if (!conn.encryptedRefreshToken || !conn.spreadsheetId || rows.length === 0) return;
  const tab = conn.sheetTabName || "Transaksi";
  for (const chunk of chunkRows(rows)) {
    const res = await fetchGoogleWithAuth(
      conn.encryptedRefreshToken,
      `https://sheets.googleapis.com/v4/spreadsheets/${conn.spreadsheetId}/values/${encodeURIComponent(tab)}!A:H:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: chunk }),
      },
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gagal menambah baris ke Google Sheets: ${errText}`);
    }
  }
}

/**
 * Incremental sync: only writes/updates/deletes pending UUID changes instead of
 * rewriting the entire spreadsheet on every transaction.
 */
export async function syncPendingChangesToSheet(
  conn: SheetConnection,
  transactions: Transaction[],
  accounts: Account[],
  pendingDeletes: string[] = [],
): Promise<{ syncedCount: number }> {
  if (!conn.connected || !conn.encryptedRefreshToken || !conn.spreadsheetId) {
    throw new Error("Google Sheets belum terhubung");
  }

  const pendingTxs = transactions.filter((t) => t.sheetSyncStatus !== "synced");
  const cleanDeletes = Array.from(new Set(pendingDeletes));
  if (pendingTxs.length === 0 && cleanDeletes.length === 0) {
    return { syncedCount: 0 };
  }

  const tab = conn.sheetTabName || "Transaksi";
  // Fast path: pure brand-new inserts on an already-initialized sheet need just 1 append call (0 reads).
  const isPureAppend =
    cleanDeletes.length === 0 &&
    Boolean(conn.lastSyncedAt) &&
    pendingTxs.every((t) => t.createdAt === t.updatedAt);

  if (isPureAppend) {
    await appendRows(
      conn,
      pendingTxs.map((tx) => transactionToSheetRow(tx, accounts)),
    );
    return { syncedCount: pendingTxs.length };
  }

  const colA = await readColumnA(conn);
  const plan = buildIncrementalSyncPlan(colA, pendingTxs, cleanDeletes);

  if (plan.needsHeader) {
    const headerRes = await fetchGoogleWithAuth(
      conn.encryptedRefreshToken,
      `https://sheets.googleapis.com/v4/spreadsheets/${conn.spreadsheetId}/values/${encodeURIComponent(tab)}!A1:H1?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: [SHEET_HEADERS] }),
      },
    );
    if (!headerRes.ok) {
      const errText = await headerRes.text();
      throw new Error(`Gagal menulis header Google Sheets: ${errText}`);
    }
  }

  // 1. Update edited rows in-place before deleting any rows so row indices stay accurate.
  if (plan.updates.length > 0) {
    for (const chunk of chunkRows(plan.updates, 500)) {
      const res = await fetchGoogleWithAuth(
        conn.encryptedRefreshToken,
        `https://sheets.googleapis.com/v4/spreadsheets/${conn.spreadsheetId}/values:batchUpdate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            valueInputOption: "USER_ENTERED",
            data: chunk.map(({ rowNumber1Based, tx }) => ({
              range: `${tab}!A${rowNumber1Based}:H${rowNumber1Based}`,
              values: [transactionToSheetRow(tx, accounts)],
            })),
          }),
        },
      );
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gagal memperbarui baris Google Sheets: ${errText}`);
      }
    }
  }

  // 2. Delete removed transaction rows from bottom to top so upper indices stay untouched.
  if (plan.deleteRowIndices0BasedDesc.length > 0) {
    const sheetId = await resolveSheetTabId(conn);
    const res = await fetchGoogleWithAuth(
      conn.encryptedRefreshToken,
      `https://sheets.googleapis.com/v4/spreadsheets/${conn.spreadsheetId}:batchUpdate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: plan.deleteRowIndices0BasedDesc.map((rowIdx) => ({
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: rowIdx,
                endIndex: rowIdx + 1,
              },
            },
          })),
        }),
      },
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gagal menghapus baris Google Sheets: ${errText}`);
    }
  }

  // 3. Append newly created rows.
  if (plan.appends.length > 0) {
    await appendRows(
      conn,
      plan.appends.map((tx) => transactionToSheetRow(tx, accounts)),
    );
  }

  return { syncedCount: pendingTxs.length + plan.deleteRowIndices0BasedDesc.length };
}

/**
 * Full chunked spreadsheet sync (writes new data FIRST, then clears leftover tail rows)
 * so an interrupted network call never leaves the user's sheet blank.
 */
export async function syncTransactionsToSheet(
  conn: SheetConnection,
  transactions: Transaction[],
  accounts: Account[],
): Promise<{ syncedCount: number }> {
  if (!conn.connected || !conn.encryptedRefreshToken || !conn.spreadsheetId) {
    throw new Error("Google Sheets belum terhubung");
  }

  const tab = conn.sheetTabName || "Transaksi";
  const allRows = [
    SHEET_HEADERS,
    ...transactions.map((tx) => transactionToSheetRow(tx, accounts)),
  ];

  let startRow = 1;
  for (const chunk of chunkRows(allRows)) {
    const endRow = startRow + chunk.length - 1;
    const range = `${tab}!A${startRow}:H${endRow}`;
    const updateRes = await fetchGoogleWithAuth(
      conn.encryptedRefreshToken,
      `https://sheets.googleapis.com/v4/spreadsheets/${conn.spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: chunk }),
      },
    );
    if (!updateRes.ok) {
      const errText = await updateRes.text();
      throw new Error(`Gagal sinkron ke Google Sheets: ${errText}`);
    }
    startRow = endRow + 1;
  }

  // Clear only surplus rows below the written range (if the sheet previously had more rows).
  await fetchGoogleWithAuth(
    conn.encryptedRefreshToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${conn.spreadsheetId}/values/${encodeURIComponent(tab)}!A${allRows.length + 1}:H:clear`,
    { method: "POST" },
  );

  return { syncedCount: transactions.length };
}

/** Legacy synchronous helper kept only if explicit immediate full sync is needed. */
export async function tryAutoSync(db: AppDatabase): Promise<void> {
  if (!db.sheetConnection.connected) return;
  try {
    await syncTransactionsToSheet(db.sheetConnection, db.transactions, db.accounts);
    db.transactions = db.transactions.map((tx) => ({ ...tx, sheetSyncStatus: "synced" }));
    db.sheetConnection.pendingDeletes = [];
    db.sheetConnection.lastSyncedAt = new Date().toISOString();
    db.sheetConnection.lastError = undefined;
  } catch (err) {
    db.sheetConnection.lastError =
      err instanceof Error ? err.message : "Gagal sinkronisasi ke Google Sheets";
  }
}
