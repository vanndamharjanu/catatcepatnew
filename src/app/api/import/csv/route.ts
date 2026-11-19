import { NextResponse } from "next/server";
import {
  isUnauthenticatedCloudRequest,
  parseLegacyCsv,
  readAsyncDb,
  toPublicState,
  writeAsyncDb,
} from "@/lib/store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { csvText?: string; accountId?: string };
    if (!body.csvText || !body.csvText.trim()) {
      return NextResponse.json({ error: "Isi CSV tidak boleh kosong." }, { status: 400 });
    }
    if (body.csvText.length > 500_000) {
      return NextResponse.json(
        { error: "Ukuran CSV terlalu besar (maksimal 500 KB per impor)." },
        { status: 413 },
      );
    }

    const db = await readAsyncDb();
    if (isUnauthenticatedCloudRequest(db)) {
      return NextResponse.json(
        { error: "Silakan masuk ke akun Anda terlebih dahulu." },
        { status: 401 },
      );
    }
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
