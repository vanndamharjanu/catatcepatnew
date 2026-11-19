import { NextResponse } from "next/server";
import {
  askGuriWithAI,
  formatAiErrorMessage,
  parseIndonesianTransactionsLocal,
  parseWithAI,
} from "@/lib/ai-parser";
import { answerFinancialQuestion } from "@/lib/finance";
import { checkRateLimit, getClientIp } from "@/lib/security";
import { readAsyncDb, writeAsyncDb } from "@/lib/store";

const MAX_TEXT_CHARS = 1000;
const MAX_QUESTION_CHARS = 500;
const MAX_IMAGE_BASE64_CHARS = 2_600_000; // ~1.9 MB decoded binary image
const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"]);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      mode?: "parse" | "ask";
      text?: string;
      imageBase64?: string;
      mimeType?: string;
      question?: string;
    };

    if (typeof body.text === "string" && body.text.length > MAX_TEXT_CHARS) {
      return NextResponse.json(
        { error: `Teks terlalu panjang (maksimal ${MAX_TEXT_CHARS} karakter).` },
        { status: 400 },
      );
    }
    if (typeof body.question === "string" && body.question.length > MAX_QUESTION_CHARS) {
      return NextResponse.json(
        { error: `Pertanyaan terlalu panjang (maksimal ${MAX_QUESTION_CHARS} karakter).` },
        { status: 400 },
      );
    }
    if (body.imageBase64) {
      if (typeof body.imageBase64 !== "string" || body.imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
        return NextResponse.json(
          { error: "Ukuran foto struk terlalu besar (maksimal ~2 MB). Kompres atau foto lebih dekat." },
          { status: 413 },
        );
      }
      if (body.mimeType && !ALLOWED_IMAGE_MIMES.has(body.mimeType.toLowerCase())) {
        return NextResponse.json(
          { error: "Format gambar harus JPG, PNG, atau WEBP." },
          { status: 400 },
        );
      }
    }

    const db = await readAsyncDb();
    const isAuthenticated = Boolean(db.auth?.authenticated && db.auth.userId);
    const rateKey = isAuthenticated
      ? `ai:user:${db.auth?.userId}`
      : `ai:ip:${getClientIp(request)}`;
    const rateLimit = checkRateLimit(rateKey, isAuthenticated ? 25 : 10, 60_000);
    if (!rateLimit.ok) {
      return NextResponse.json(
        {
          error: `Terlalu banyak permintaan AI dalam 1 menit. Tunggu ${rateLimit.retryAfterSec} detik lalu coba lagi.`,
        },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSec) } },
      );
    }

    const isFreeLimited = isAuthenticated && db.settings.plan !== "pro";
    const creditsLeft = db.settings.aiCreditsRemaining ?? 20;

    if (body.mode === "ask") {
      const question = (body.question || "").trim();
      if (question && db.transactions.length > 0 && (!isFreeLimited || creditsLeft > 0)) {
        const aiAsk = await askGuriWithAI(question, db);
        if (aiAsk.answer) {
          if (isFreeLimited) {
            db.settings.aiCreditsRemaining = Math.max(0, creditsLeft - 1);
            await writeAsyncDb(db);
          }
          return NextResponse.json({
            answer: aiAsk.answer,
            engine: aiAsk.engine,
            aiCreditsRemaining: db.settings.aiCreditsRemaining,
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
      const warning =
        isFreeLimited && creditsLeft <= 0
          ? "Kuota AI gratis (20x) sudah habis; jawaban dihitung memakai rumus lokal."
          : undefined;
      return NextResponse.json({ answer, engine: "local", warning });
    }

    if (isFreeLimited && creditsLeft <= 0) {
      if (body.imageBase64 && !body.text) {
        return NextResponse.json(
          {
            error:
              "Kuota scan struk AI gratis (20x) sudah habis. Gunakan input cepat 1-layar atau suara/teks lokal.",
            drafts: [],
            engine: "local-parser",
          },
          { status: 402 },
        );
      }
      const drafts = parseIndonesianTransactionsLocal(body.text || "", db.accounts);
      if (drafts.length === 0) {
        return NextResponse.json(
          {
            error:
              "Kuota AI gratis (20x) habis dan teks belum terbaca otomatis. Tulis angka jelas, misal: 'Ngopi 25rb cash'.",
            drafts: [],
            engine: "local-parser",
          },
          { status: 400 },
        );
      }
      return NextResponse.json({
        drafts,
        engine: "local-parser",
        warning: "Kuota AI gratis habis; hasil diproses memakai Parser Lokal.",
      });
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
      if (isFreeLimited) {
        db.settings.aiCreditsRemaining = Math.max(0, creditsLeft - 1);
        await writeAsyncDb(db);
      }
      return NextResponse.json({
        drafts: aiOutcome.drafts,
        engine: aiOutcome.engine,
        aiCreditsRemaining: db.settings.aiCreditsRemaining,
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
