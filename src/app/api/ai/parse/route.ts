import { NextResponse } from "next/server";
import {
  askGuriWithAI,
  formatAiErrorMessage,
  parseIndonesianTransactionsLocal,
  parseWithAI,
} from "@/lib/ai-parser";
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
      const question = (body.question || "").trim();
      if (question && db.transactions.length > 0) {
        const aiAsk = await askGuriWithAI(question, db);
        if (aiAsk.answer) {
          return NextResponse.json({
            answer: aiAsk.answer,
            engine: aiAsk.engine,
          });
        }
        const fallbackAnswer = answerFinancialQuestion(
          question,
          db.transactions,
          db.accounts,
          db.settings.monthlyBudget,
          db.settings.paydayDay,
        );
        const warning =
          aiAsk.errorKind && aiAsk.errorKind !== "not_configured" && aiAsk.errorKind !== "unreadable"
            ? `AI sedang tidak tersedia (${aiAsk.errorDetail || aiAsk.errorKind}); jawaban dihitung lokal.`
            : undefined;
        return NextResponse.json({ answer: fallbackAnswer, engine: "local", warning });
      }

      const answer = answerFinancialQuestion(
        question,
        db.transactions,
        db.accounts,
        db.settings.monthlyBudget,
        db.settings.paydayDay,
      );
      return NextResponse.json({ answer, engine: "local" });
    }

    const categoriesKeluar = db.categories.filter((c) => c.type === "Keluar").map((c) => c.name);
    const categoriesMasuk = db.categories.filter((c) => c.type === "Masuk").map((c) => c.name);

    const aiOutcome = await parseWithAI({
      text: body.text,
      imageBase64: body.imageBase64,
      mimeType: body.mimeType,
      accounts: db.accounts,
      categoriesKeluar,
      categoriesMasuk,
    });

    if (aiOutcome.drafts.length > 0) {
      return NextResponse.json({
        drafts: aiOutcome.drafts,
        engine: aiOutcome.engine,
      });
    }

    const hasAnyKey = aiOutcome.errorKind !== "not_configured";
    const statusMap = {
      not_configured: 400,
      invalid_key: 401,
      rate_limit: 429,
      unavailable: 503,
      unreadable: 422,
    } as const;

    if (body.imageBase64 && !body.text) {
      const kind = aiOutcome.errorKind || "unreadable";
      return NextResponse.json(
        {
          error: formatAiErrorMessage(kind, { isReceipt: true, hasAnyKey }),
          errorKind: kind,
          drafts: [],
          engine: "local-parser",
        },
        { status: statusMap[kind] },
      );
    }

    const drafts = parseIndonesianTransactionsLocal(body.text || "", db.accounts);
    if (drafts.length === 0) {
      const kind = aiOutcome.errorKind || "unreadable";
      return NextResponse.json(
        {
          error: formatAiErrorMessage(kind, { isReceipt: false, hasAnyKey }),
          errorKind: kind,
          drafts: [],
          engine: "local-parser",
        },
        { status: hasAnyKey && kind !== "unreadable" ? statusMap[kind] : 400 },
      );
    }

    const warning =
      hasAnyKey && aiOutcome.errorKind && aiOutcome.errorKind !== "unreadable"
        ? `AI utama gagal (${aiOutcome.errorDetail || aiOutcome.errorKind}); hasil diproses memakai Parser Lokal.`
        : undefined;

    return NextResponse.json({ drafts, engine: "local-parser", warning });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal memproses input AI." },
      { status: 500 },
    );
  }
}
