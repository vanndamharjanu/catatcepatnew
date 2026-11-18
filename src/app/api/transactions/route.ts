import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { computeAccountBalances, formatRupiah, toIsoDate } from "@/lib/finance";
import { readAsyncDb, toPublicState, writeAsyncDb } from "@/lib/store";
import type { Account, Transaction, TransactionSource, TransactionType } from "@/lib/types";

interface TransactionInput {
  date?: string;
  type?: TransactionType;
  category?: string;
  accountId?: string;
  toAccountId?: string;
  amount?: number;
  note?: string;
  source?: TransactionSource;
}

type ValidTx = Omit<Transaction, "id" | "createdAt" | "updatedAt" | "sheetSyncStatus">;

function validateTxInput(raw: TransactionInput, accounts: Account[]): ValidTx | { error: string } {
  const amount = Math.round(Number(raw.amount) || 0);
  if (amount <= 0) return { error: "Nominal transaksi harus lebih besar dari Rp 0." };
  const date = raw.date && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)
    ? raw.date
    : toIsoDate();
  const type: TransactionType =
    raw.type === "Masuk" || raw.type === "Transfer" || raw.type === "Koreksi"
      ? raw.type
      : "Keluar";

  const accountId = raw.accountId || accounts[0]?.id;
  if (!accountId || !accounts.some((a) => a.id === accountId)) {
    return { error: "Akun transaksi tidak ditemukan." };
  }
  if (type === "Transfer") {
    if (!raw.toAccountId || !accounts.some((a) => a.id === raw.toAccountId)) {
      return { error: "Pilih akun tujuan transfer yang valid." };
    }
    if (raw.toAccountId === accountId) {
      return { error: "Akun tujuan transfer harus berbeda dari akun asal." };
    }
  }

  return {
    date,
    type,
    category: (raw.category || (type === "Transfer" ? "Transfer Akun" : "Lain-lain")).trim(),
    accountId,
    toAccountId: type === "Transfer" ? raw.toAccountId : undefined,
    amount,
    note: (raw.note || "").trim().slice(0, 200),
    source: raw.source || "manual",
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: "reconcile";
      actualBalance?: number;
      items?: TransactionInput[];
    } & TransactionInput;

    const db = await readAsyncDb();
    const nowIso = new Date().toISOString();

    if (body.action === "reconcile") {
      const targetAccount = db.accounts.find((a) => a.id === body.accountId);
      if (!targetAccount) {
        return NextResponse.json({ error: "Pilih akun yang valid." }, { status: 400 });
      }
      const actualBalance = Math.round(Number(body.actualBalance));
      if (!Number.isFinite(actualBalance) || actualBalance < 0) {
        return NextResponse.json({ error: "Saldo asli harus berupa angka 0 atau lebih." }, { status: 400 });
      }

      const currentBalance =
        computeAccountBalances(db.accounts, db.transactions).find((a) => a.id === targetAccount.id)
          ?.balance ?? 0;
      const diff = actualBalance - currentBalance;
      if (diff === 0) {
        return NextResponse.json(
          { error: `Saldo ${targetAccount.name} sudah sesuai (${formatRupiah(currentBalance)}).` },
          { status: 400 },
        );
      }

      const reconciliationTx: Transaction = {
        id: randomUUID(),
        date: body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : toIsoDate(),
        type: "Koreksi",
        category: diff > 0 ? "Koreksi Tambah" : "Koreksi Kurang",
        accountId: targetAccount.id,
        amount: Math.abs(diff),
        note:
          (body.note || "").trim().slice(0, 200) ||
          `Koreksi ${targetAccount.name}: ${formatRupiah(currentBalance)} ke ${formatRupiah(actualBalance)}`,
        source: "reconciliation",
        sheetSyncStatus: db.sheetConnection.connected ? "pending" : "local_only",
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      db.transactions.unshift(reconciliationTx);
      await writeAsyncDb(db);
      return NextResponse.json(toPublicState(db), { status: 201 });
    }

    const rawList = Array.isArray(body.items) ? body.items : [body];

    // All-or-nothing: one invalid row rejects the batch instead of silently dropping it.
    const created: Transaction[] = [];
    for (const item of rawList) {
      const valid = validateTxInput(item, db.accounts);
      if ("error" in valid) {
        return NextResponse.json({ error: valid.error }, { status: 400 });
      }
      created.push({
        id: randomUUID(),
        ...valid,
        sheetSyncStatus: db.sheetConnection.connected ? "pending" : "local_only",
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    if (created.length === 0) {
      return NextResponse.json({ error: "Tidak ada transaksi untuk disimpan." }, { status: 400 });
    }

    db.transactions = [...created, ...db.transactions];
    await writeAsyncDb(db);

    return NextResponse.json(toPublicState(db), { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal menyimpan transaksi." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { id?: string } & TransactionInput;
    if (!body.id) {
      return NextResponse.json({ error: "ID transaksi wajib disertakan." }, { status: 400 });
    }

    const db = await readAsyncDb();
    const idx = db.transactions.findIndex((t) => t.id === body.id);
    if (idx === -1) {
      return NextResponse.json({ error: "Transaksi tidak ditemukan." }, { status: 404 });
    }

    const valid = validateTxInput(body, db.accounts);
    if ("error" in valid) {
      return NextResponse.json({ error: valid.error }, { status: 400 });
    }

    db.transactions[idx] = {
      ...db.transactions[idx],
      ...valid,
      source: db.transactions[idx].source,
      sheetSyncStatus: db.sheetConnection.connected ? "pending" : "local_only",
      updatedAt: new Date().toISOString(),
    };

    await writeAsyncDb(db);
    return NextResponse.json(toPublicState(db));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal memperbarui transaksi." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Parameter id wajib diisi." }, { status: 400 });
    }

    const db = await readAsyncDb();
    const before = db.transactions.length;
    db.transactions = db.transactions.filter((t) => t.id !== id);
    if (db.transactions.length === before) {
      return NextResponse.json({ error: "Transaksi tidak ditemukan." }, { status: 404 });
    }

    if (db.sheetConnection.connected) {
      db.sheetConnection.pendingDeletes = Array.from(
        new Set([...(db.sheetConnection.pendingDeletes ?? []), id]),
      );
    }

    await writeAsyncDb(db);
    return NextResponse.json(toPublicState(db));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal menghapus transaksi." },
      { status: 500 },
    );
  }
}
