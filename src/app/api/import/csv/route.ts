import { NextResponse } from "next/server";
import { parseLegacyCsv, readDb, toPublicState, writeDb } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { csvText?: string; accountId?: string };
    if (!body.csvText || !body.csvText.trim()) {
      return NextResponse.json({ error: "Isi CSV tidak boleh kosong." }, { status: 400 });
    }

    const db = readDb();
    const targetAccountId = body.accountId || db.accounts[0]?.id || "acc-cash";
    const imported = parseLegacyCsv(body.csvText, targetAccountId);

    if (imported.length === 0) {
      return NextResponse.json(
        { error: "Tidak ada baris transaksi valid yang terbaca dari CSV." },
        { status: 400 },
      );
    }

    db.transactions = [...imported, ...db.transactions];
    writeDb(db);
    return NextResponse.json({
      importedCount: imported.length,
      state: toPublicState(db),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal mengimpor CSV." },
      { status: 500 },
    );
  }
}
