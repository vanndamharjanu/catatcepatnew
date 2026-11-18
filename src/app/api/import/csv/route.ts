import { NextResponse } from "next/server";
import { parseLegacyCsv, readAsyncDb, toPublicState, writeAsyncDb } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { csvText?: string; accountId?: string };
    if (!body.csvText || !body.csvText.trim()) {
      return NextResponse.json({ error: "Isi CSV tidak boleh kosong." }, { status: 400 });
    }

    const db = await readAsyncDb();
    const targetAccountId = body.accountId || db.accounts[0]?.id || "acc-cash";
    const imported = parseLegacyCsv(body.csvText, targetAccountId);

    if (imported.length === 0) {
      return NextResponse.json(
        { error: "Tidak ada baris transaksi valid yang terbaca dari CSV." },
        { status: 400 },
      );
    }

    db.transactions = [...imported, ...db.transactions];
    await writeAsyncDb(db);
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
