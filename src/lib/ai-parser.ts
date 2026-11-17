import { randomUUID } from "node:crypto";
import type { Account, ParsedTransactionDraft, TransactionType } from "./types.ts";
import { toIsoDate } from "./finance.ts";

const CATEGORY_KEYWORDS: Array<{ category: string; type: "Masuk" | "Keluar"; words: string[] }> = [
  { category: "Gaji", type: "Masuk", words: ["gaji", "salary", "payroll"] },
  { category: "TPP", type: "Masuk", words: ["tpp", "tunjangan"] },
  { category: "TPG", type: "Masuk", words: ["tpg", "sertifikasi"] },
  { category: "Bonus", type: "Masuk", words: ["bonus", "thr", "insentif", "komisi", "freelance", "bayaran"] },
  { category: "Makanan", type: "Keluar", words: ["makan", "ngopi", "kopi", "sarapan", "lunch", "dinner", "bakso", "nasi", "minum", "jajan", "snack", "warteg", "boba", "mie", "telur"] },
  { category: "Transportasi", type: "Keluar", words: ["parkir", "bensin", "pertalite", "pertamax", "gojek", "grab", "ojek", "tol", "kereta", "krl", "mrt", "bus", "transjakarta", "grabcar"] },
  { category: "Kebutuhan Sehari-hari", type: "Keluar", words: ["sabun", "beras", "indomaret", "alfamart", "belanja", "supermarket", "galon", "gas", "listrik", "token"] },
  { category: "Komunikasi", type: "Keluar", words: ["pulsa", "kuota", "paket data", "wifi", "internet", "telkom"] },
  { category: "Pembayaran", type: "Keluar", words: ["tagihan", "bayar", "cicilan", "air", "pdam", "bpjs", "sewa", "kost", "kontrakan"] },
  { category: "Tabungan", type: "Keluar", words: ["tabung", "nabung", "invest", "emas", "reksadana"] },
  { category: "Kado", type: "Keluar", words: ["kado", "hadiah", "sumbangan", "kondangan", "sedekah", "donasi"] },
];

function parseAmountToken(segment: string): number {
  // Handle discount expressions like "100rb diskon 10rb" or "100k potongan 10k"
  const discountMatch = segment.match(
    /(\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta)?\s*(?:diskon|potongan|cashback)\s*(\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta)?/i,
  );
  if (discountMatch) {
    const gross = normalizeNumber(discountMatch[1], discountMatch[2]);
    const disc = normalizeNumber(discountMatch[3], discountMatch[4]);
    return Math.max(0, gross - disc);
  }

  // Match Rp 25.000, 25rb, 5jt, 15000, 2.5jt
  const matches = Array.from(
    segment.matchAll(/(?:rp\.?\s*)?(\d+(?:[.,]\d+)*)\s*(rb|ribu|k|jt|juta)?\b/gi),
  );
  for (const m of matches) {
    const rawNum = m[1];
    const unit = m[2];
    // Skip dates like 16/11 or 2026 if standalone without unit and looks like year
    if (!unit && rawNum.length === 4 && Number(rawNum) >= 2020 && Number(rawNum) <= 2035) {
      continue;
    }
    const val = normalizeNumber(rawNum, unit);
    if (val > 0) return val;
  }
  return 0;
}

function normalizeNumber(raw: string, unit?: string): number {
  const lowerUnit = (unit || "").toLowerCase();
  let numStr = raw;
  if (lowerUnit === "jt" || lowerUnit === "juta") {
    numStr = raw.replace(",", ".");
    return Math.round(parseFloat(numStr) * 1_000_000);
  }
  if (lowerUnit === "rb" || lowerUnit === "ribu" || lowerUnit === "k") {
    numStr = raw.replace(",", ".");
    return Math.round(parseFloat(numStr) * 1_000);
  }
  // Plain Rupiah integer with thousand separators (e.g. 25.000 or 2.000)
  const digits = raw.replace(/[.,]/g, "");
  return parseInt(digits, 10) || 0;
}

function inferAccount(segment: string, accounts: Account[]): string {
  const lower = segment.toLowerCase();
  const findByKind = (kind: Account["kind"]) =>
    accounts.find((a) => a.kind === kind)?.id || accounts[0]?.id || "acc-cash";

  if (/(gopay|ovo|dana|shopeepay|linkaja|qris|e-wallet|ewallet)/i.test(lower)) {
    return findByKind("ewallet");
  }
  if (/(bca|bri|bni|mandiri|bsi|jago|seabank|blu|bank|rekening|debit|transfer)/i.test(lower)) {
    return findByKind("bank");
  }
  if (/(cash|tunai|dompet)/i.test(lower)) {
    return findByKind("cash");
  }
  return accounts[0]?.id || "acc-cash";
}

/** Deterministic Indonesian multi-transaction parser for offline/instant usage. */
export function parseIndonesianTransactionsLocal(
  text: string,
  accounts: Account[],
  defaultDate: string = toIsoDate(),
): ParsedTransactionDraft[] {
  const segments = text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const drafts: ParsedTransactionDraft[] = [];

  for (const seg of segments) {
    const amount = parseAmountToken(seg);
    if (amount <= 0) continue;

    const lower = seg.toLowerCase();
    let date = defaultDate;
    if (lower.includes("kemarin")) {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      date = toIsoDate(d);
    }

    // Check explicit transfer syntax: "transfer 100rb dari cash ke bca"
    const transferMatch = lower.match(/dari\s+([a-z0-9\s-]+?)\s+ke\s+([a-z0-9\s-]+)/i);
    if (lower.includes("transfer") && transferMatch) {
      const fromAcc = inferAccount(transferMatch[1], accounts);
      const toAcc = inferAccount(transferMatch[2], accounts);
      drafts.push({
        tempId: randomUUID(),
        date,
        type: "Transfer",
        category: "Transfer Akun",
        accountId: fromAcc,
        toAccountId: toAcc === fromAcc ? accounts.find((a) => a.id !== fromAcc)?.id : toAcc,
        amount,
        note: seg,
        confidence: "high",
      });
      continue;
    }

    let inferredType: TransactionType = "Keluar";
    let inferredCategory = "Lain-lain";
    let matchedKeyword = false;

    for (const rule of CATEGORY_KEYWORDS) {
      if (rule.words.some((w) => lower.includes(w))) {
        inferredType = rule.type;
        inferredCategory = rule.category;
        matchedKeyword = true;
        break;
      }
    }

    if (!matchedKeyword && /(terima|masuk|dapat|pemasukan|income)/i.test(lower)) {
      inferredType = "Masuk";
      inferredCategory = "Bonus";
    }

    // Clean note by trimming redundant amount/account fluff only lightly, keeping human phrasing
    const cleanedNote = seg.charAt(0).toUpperCase() + seg.slice(1);

    drafts.push({
      tempId: randomUUID(),
      date,
      type: inferredType,
      category: inferredCategory,
      accountId: inferAccount(seg, accounts),
      amount,
      note: cleanedNote,
      confidence: matchedKeyword ? "high" : "medium",
    });
  }

  return drafts;
}

/** Optional Gemini 2.5 Flash parser when GEMINI_API_KEY is configured in .env.local. */
export async function parseWithGemini(params: {
  text?: string;
  imageBase64?: string;
  mimeType?: string;
  accounts: Account[];
  categoriesKeluar: string[];
  categoriesMasuk: string[];
}): Promise<ParsedTransactionDraft[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const today = toIsoDate();
  const accountMapHint = params.accounts.map((a) => `${a.id}:${a.name}`).join(", ");
  const prompt = [
    `Ekstrak transaksi keuangan berbahasa Indonesia dari input atau foto struk.`,
    `Tanggal hari ini: ${today}.`,
    `Daftar accountId yang tersedia: ${accountMapHint}.`,
    `Kategori Keluar: ${params.categoriesKeluar.join(", ")}.`,
    `Kategori Masuk: ${params.categoriesMasuk.join(", ")}.`,
    `Kembalikan HANYA JSON array of objects tanpa markdown fence, format:`,
    `[{"date":"YYYY-MM-DD","type":"Keluar"|"Masuk"|"Transfer","category":"...","accountId":"...","amount":12300,"note":"ringkasan singkat"}]`,
    params.text ? `Input user: ${params.text}` : "Baca item atau total belanja dari gambar struk.",
  ].join("\n");

  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (params.imageBase64 && params.mimeType) {
    parts.push({
      inline_data: {
        mime_type: params.mimeType,
        data: params.imageBase64,
      },
    });
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.1 },
      }),
    },
  );

  if (!res.ok) return null;
  const payload = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) return null;

  const jsonMatch = rawText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;

  const parsed = JSON.parse(jsonMatch[0]) as Array<{
    date?: string;
    type?: TransactionType;
    category?: string;
    accountId?: string;
    amount?: number;
    note?: string;
  }>;

  return parsed
    .filter((item) => typeof item.amount === "number" && item.amount > 0)
    .map((item) => ({
      tempId: randomUUID(),
      date: item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : today,
      type: item.type === "Masuk" || item.type === "Transfer" ? item.type : "Keluar",
      category: item.category || "Lain-lain",
      accountId: params.accounts.some((a) => a.id === item.accountId)
        ? (item.accountId as string)
        : params.accounts[0]?.id || "acc-cash",
      amount: Math.round(item.amount || 0),
      note: item.note || "Transaksi dari AI",
      confidence: "high" as const,
    }));
}
