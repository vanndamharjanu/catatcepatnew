import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { tryAutoSync } from "@/lib/google-sheets";
import { toIsoDate } from "@/lib/finance";
import { readDb, toPublicState, writeDb } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: "create_goal" | "deposit_goal";
      name?: string;
      targetAmount?: number;
      deadline?: string;
      goalId?: string;
      amount?: number;
      accountId?: string;
    };

    const db = readDb();
    const nowIso = new Date().toISOString();

    if (body.action === "deposit_goal") {
      const amount = Math.round(Number(body.amount) || 0);
      const goal = db.goals.find((g) => g.id === body.goalId);
      if (!goal || amount <= 0) {
        return NextResponse.json(
          { error: "Pilih target tabungan dan masukkan nominal setoran valid." },
          { status: 400 },
        );
      }

      goal.currentAmount += amount;
      const accountId = body.accountId || db.accounts[0]?.id || "acc-cash";
      if (!db.accounts.some((a) => a.id === accountId)) {
        return NextResponse.json({ error: "Akun sumber setoran tidak ditemukan." }, { status: 400 });
      }
      db.transactions.unshift({
        id: randomUUID(),
        date: toIsoDate(),
        type: "Keluar",
        category: "Tabungan",
        accountId,
        amount,
        note: `Setor target: ${goal.name}`,
        goalId: goal.id,
        source: "manual",
        sheetSyncStatus: db.sheetConnection.connected ? "pending" : "local_only",
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      await tryAutoSync(db);
      writeDb(db);
      return NextResponse.json(toPublicState(db), { status: 201 });
    }

    const name = (body.name || "").trim();
    const targetAmount = Math.round(Number(body.targetAmount) || 0);
    if (!name || targetAmount <= 0) {
      return NextResponse.json(
        { error: "Nama target dan nominal target wajib diisi." },
        { status: 400 },
      );
    }

    db.goals.push({
      id: randomUUID(),
      name: name.slice(0, 60),
      targetAmount,
      currentAmount: 0,
      deadline: body.deadline || undefined,
      createdAt: nowIso,
    });

    writeDb(db);
    return NextResponse.json(toPublicState(db), { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal memproses target tabungan." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Parameter id wajib diisi." }, { status: 400 });
  }
  const db = readDb();
  db.goals = db.goals.filter((g) => g.id !== id);
  // Deleting a goal cancels its deposits so the money returns to the source account balance.
  const before = db.transactions.length;
  db.transactions = db.transactions.filter((t) => t.goalId !== id);
  if (db.transactions.length !== before) {
    await tryAutoSync(db);
  }
  writeDb(db);
  return NextResponse.json(toPublicState(db));
}
