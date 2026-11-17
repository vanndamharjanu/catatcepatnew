import { NextResponse } from "next/server";
import { parseIndonesianTransactionsLocal, parseWithGemini } from "@/lib/ai-parser";
import { answerFinancialQuestion } from "@/lib/finance";
import { readDb } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      mode?: "parse" | "ask";
      text?: string;
      imageBase64?: string;
      mimeType?: string;
      question?: string;
    };

    const db = readDb();

    if (body.mode === "ask") {
      const answer = answerFinancialQuestion(
        body.question || "",
        db.transactions,
        db.accounts,
        db.settings.monthlyBudget,
        db.settings.paydayDay,
      );
      return NextResponse.json({ answer });
    }

    const categoriesKeluar = db.categories.filter((c) => c.type === "Keluar").map((c) => c.name);
    const categoriesMasuk = db.categories.filter((c) => c.type === "Masuk").map((c) => c.name);

    // Try Gemini API first when GEMINI_API_KEY is configured
    if (process.env.GEMINI_API_KEY) {
      try {
        const geminiDrafts = await parseWithGemini({
          text: body.text,
          imageBase64: body.imageBase64,
          mimeType: body.mimeType,
          accounts: db.accounts,
          categoriesKeluar,
          categoriesMasuk,
        });
        if (geminiDrafts && geminiDrafts.length > 0) {
          return NextResponse.json({ drafts: geminiDrafts, engine: "gemini" });
        }
      } catch {
        // Fall back transparently to local parser below
      }
    }

    if (body.imageBase64 && !body.text) {
      return NextResponse.json(
        {
          error:
            "Scan gambar struk membutuhkan GEMINI_API_KEY di .env.local. Untuk uji coba sekarang, ketik atau ucapkan nominal transaksi secara langsung.",
          drafts: [],
          engine: "local-parser",
        },
        { status: 400 },
      );
    }

    const drafts = parseIndonesianTransactionsLocal(body.text || "", db.accounts);
    if (drafts.length === 0) {
      return NextResponse.json(
        {
          error:
            "Belum ditemukan nominal transaksi. Contoh format: 'Ngopi 25rb pake gopay, parkir 2rb cash'.",
          drafts: [],
          engine: "local-parser",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ drafts, engine: "local-parser" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal memproses input AI." },
      { status: 500 },
    );
  }
}
