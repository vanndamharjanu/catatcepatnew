import { NextResponse } from "next/server";
import {
  syncPendingChangesToSheet,
  syncTransactionsToSheet,
  transactionToSheetRow,
} from "@/lib/google-sheets";
import { isUnauthenticatedCloudRequest, readAsyncDb, toPublicState, writeAsyncDb } from "@/lib/store";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { full?: boolean };
  const db = await readAsyncDb();
  if (isUnauthenticatedCloudRequest(db)) {
    return NextResponse.json(
      { error: "Silakan masuk ke akun Anda terlebih dahulu." },
      { status: 401 },
    );
  }
  if (!db.sheetConnection.connected) {
    const previewRows = [
      ["Transaction ID", "Tanggal", "Jenis", "Kategori", "Akun", "Nominal", "Keterangan", "Diperbarui"],
      ...db.transactions.slice(0, 10).map((tx) => transactionToSheetRow(tx, db.accounts)),
    ];
    return NextResponse.json({
      mode: "preview",
      message: "Google Sheets belum dihubungkan; menampilkan pratinjau struktur tabel siap sinkron.",
      previewRows,
    });
  }

  const pendingDeletes = db.sheetConnection.pendingDeletes || [];
  const targetVersionById = new Map(
    db.transactions
      .filter((t) => body.full || t.sheetSyncStatus !== "synced")
      .map((t) => [t.id, t.updatedAt]),
  );
  const deletedIdSet = new Set(pendingDeletes);

  try {
    const result = body.full
      ? await syncTransactionsToSheet(db.sheetConnection, db.transactions, db.accounts)
      : await syncPendingChangesToSheet(
          db.sheetConnection,
          db.transactions,
          db.accounts,
          pendingDeletes,
        );

    // Re-read latest state so concurrent local edits made during the HTTP call aren't overwritten.
    const latest = await readAsyncDb();
    latest.transactions = latest.transactions.map((t) => {
      const syncedVersion = targetVersionById.get(t.id);
      if (syncedVersion !== undefined && syncedVersion === t.updatedAt) {
        return { ...t, sheetSyncStatus: "synced" };
      }
      return t;
    });
    if (body.full) {
      latest.sheetConnection.pendingDeletes = [];
    } else if (latest.sheetConnection.pendingDeletes) {
      latest.sheetConnection.pendingDeletes = latest.sheetConnection.pendingDeletes.filter(
        (id) => !deletedIdSet.has(id),
      );
    }
    if (typeof db.sheetConnection.sheetTabId === "number") {
      latest.sheetConnection.sheetTabId = db.sheetConnection.sheetTabId;
    }
    latest.sheetConnection.lastSyncedAt = new Date().toISOString();
    latest.sheetConnection.lastError = undefined;
    await writeAsyncDb(latest);

    return NextResponse.json({
      mode: "live",
      syncedCount: result.syncedCount,
      state: toPublicState(latest),
    });
  } catch (err) {
    const latest = await readAsyncDb();
    latest.sheetConnection.lastError =
      err instanceof Error ? err.message : "Gagal sinkron ke Google Sheets";
    await writeAsyncDb(latest);
    return NextResponse.json(
      { error: latest.sheetConnection.lastError },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const db = await readAsyncDb();
  if (isUnauthenticatedCloudRequest(db)) {
    return NextResponse.json(
      { error: "Silakan masuk ke akun Anda terlebih dahulu." },
      { status: 401 },
    );
  }
  db.sheetConnection = {
    configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    connected: false,
    sheetTabName: "Transaksi",
  };
  await writeAsyncDb(db);
  return NextResponse.json(toPublicState(db));
}
