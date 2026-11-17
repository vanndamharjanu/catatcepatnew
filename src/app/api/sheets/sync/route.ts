import { NextResponse } from "next/server";
import { syncTransactionsToSheet, transactionToSheetRow } from "@/lib/google-sheets";
import { readDb, toPublicState, writeDb } from "@/lib/store";

export async function POST() {
  const db = readDb();
  if (!db.sheetConnection.connected) {
    const previewRows = [
      ["Transaction ID", "Tanggal", "Jenis", "Kategori", "Akun", "Nominal", "Keterangan", "Diperbarui"],
      ...db.transactions.slice(0, 10).map((tx) => transactionToSheetRow(tx, db.accounts)),
    ];
    return NextResponse.json({
      mode: "preview",
      message: "Google Sheets belum dihubungkan; menampilkan pratinjau struktur baris UUID siap sync.",
      previewRows,
    });
  }

  try {
    const result = await syncTransactionsToSheet(
      db.sheetConnection,
      db.transactions,
      db.accounts,
    );
    db.transactions = db.transactions.map((t) => ({ ...t, sheetSyncStatus: "synced" }));
    db.sheetConnection.lastSyncedAt = new Date().toISOString();
    db.sheetConnection.lastError = undefined;
    writeDb(db);

    return NextResponse.json({
      mode: "live",
      syncedCount: result.syncedCount,
      state: toPublicState(db),
    });
  } catch (err) {
    db.sheetConnection.lastError =
      err instanceof Error ? err.message : "Gagal sinkron ke Google Sheets";
    writeDb(db);
    return NextResponse.json(
      { error: db.sheetConnection.lastError },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const db = readDb();
  db.sheetConnection = {
    configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    connected: false,
    sheetTabName: "Transaksi",
  };
  writeDb(db);
  return NextResponse.json(toPublicState(db));
}
