import { randomUUID } from "node:crypto";
import type {
  Account,
  AppDatabase,
  ParsedTransactionDraft,
  TransactionType,
} from "./types.ts";
import {
  computeAccountBalances,
  computeDailyAllowance,
  computePeriodMetrics,
  formatRupiah,
  toIsoDate,
} from "./finance.ts";

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

export type AiErrorKind =
  | "not_configured"
  | "invalid_key"
  | "rate_limit"
  | "unavailable"
  | "unreadable";

export interface AiParseOutcome {
  drafts: ParsedTransactionDraft[];
  engine: "gemini" | "gateway" | null;
  model?: string;
  usedFallback?: boolean;
  errorKind?: AiErrorKind;
  errorDetail?: string;
}

const DEFAULT_GEMINI_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.6-flash",
  "gemini-2.5-flash",
];

/** Build ordered unique list of Gemini models (primary env override + fallbacks). */
export function resolveGeminiModelChain(
  primaryModel?: string,
  fallbackModelsCsv?: string,
): string[] {
  const fromEnvFallback = (fallbackModelsCsv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const candidates = [
    primaryModel?.trim(),
    ...(fromEnvFallback.length > 0 ? fromEnvFallback : DEFAULT_GEMINI_MODELS),
  ].filter((s): s is string => Boolean(s));

  return Array.from(new Set(candidates));
}

function buildAiPrompt(params: {
  text?: string;
  accounts: Account[];
  categoriesKeluar: string[];
  categoriesMasuk: string[];
}): string {
  const now = new Date();
  const today = toIsoDate(now);
  const yesterday = toIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const accountMapHint = params.accounts.map((a) => `${a.id}:${a.name}`).join(", ");
  return [
    `Ekstrak semua transaksi keuangan berbahasa Indonesia dari teks atau foto struk.`,
    `Tanggal hari ini: ${today} (kemarin: ${yesterday}).`,
    `Daftar accountId: ${accountMapHint}.`,
    `Kategori Keluar (pilih yang paling cocok): ${params.categoriesKeluar.join(", ")}.`,
    `Kategori Masuk (pilih yang paling cocok): ${params.categoriesMasuk.join(", ")}.`,
    `Aturan: pahami angka informal (rb/k/ribu, jt/juta, ceban=10000, gocap=50000), hitung harga bersih jika ada diskon/potongan, dan untuk Transfer isi accountId asal dan toAccountId tujuan.`,
    `Kembalikan HANYA JSON array of objects tanpa markdown fence, format:`,
    `[{"date":"YYYY-MM-DD","type":"Keluar"|"Masuk"|"Transfer","category":"...","accountId":"...","toAccountId":"...","amount":12300,"note":"ringkasan singkat"}]`,
    params.text ? `Input user: ${params.text}` : "Baca total/item belanja dari foto struk.",
  ].join("\n");
}

/** Extract JSON array of transaction drafts returned by an LLM and normalize against known accounts. */
export function normalizeRawAiDrafts(
  rawText: string,
  accounts: Account[],
  defaultDate: string = toIsoDate(),
): ParsedTransactionDraft[] {
  const jsonMatch = rawText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  let parsed: Array<{
    date?: string;
    type?: TransactionType;
    category?: string;
    accountId?: string;
    toAccountId?: string;
    amount?: number | string;
    note?: string;
  }>;
  try {
    const decoded = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(decoded)) return [];
    parsed = decoded;
  } catch {
    return [];
  }

  const defaultAccId = accounts[0]?.id || "acc-cash";
  return parsed
    .map((item) => {
      const amount = Math.round(Number(item.amount) || 0);
      if (amount <= 0) return null;
      const type: TransactionType =
        item.type === "Masuk" || item.type === "Transfer" ? item.type : "Keluar";
      const accountId = accounts.some((a) => a.id === item.accountId)
        ? (item.accountId as string)
        : defaultAccId;
      let toAccountId: string | undefined;
      if (type === "Transfer") {
        toAccountId =
          item.toAccountId &&
          item.toAccountId !== accountId &&
          accounts.some((a) => a.id === item.toAccountId)
            ? item.toAccountId
            : accounts.find((a) => a.id !== accountId)?.id;
        if (!toAccountId) return null;
      }
      return {
        tempId: randomUUID(),
        date: item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : defaultDate,
        type,
        category: (item.category || (type === "Transfer" ? "Transfer Akun" : "Lain-lain")).trim(),
        accountId,
        toAccountId,
        amount,
        note: (item.note || "Transaksi dari AI").trim().slice(0, 200),
        confidence: "high" as const,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null) as ParsedTransactionDraft[];
}

function classifyHttpError(status: number, bodyText: string): { kind: AiErrorKind; detail: string } {
  const lower = bodyText.toLowerCase();
  if (status === 401 || status === 403 || lower.includes("api_key_invalid") || lower.includes("invalid api key")) {
    return { kind: "invalid_key", detail: `HTTP ${status}: API key ditolak atau tidak valid` };
  }
  if (status === 429 || lower.includes("resource_exhausted") || lower.includes("rate limit")) {
    return { kind: "rate_limit", detail: `HTTP ${status}: kuota atau rate limit penuh` };
  }
  if (status >= 500 || status === 404) {
    return { kind: "unavailable", detail: `HTTP ${status}: layanan atau model sedang tidak tersedia` };
  }
  return { kind: "unreadable", detail: `HTTP ${status}` };
}

/** Map failure reason to a clear Indonesian message for the UI. */
export function formatAiErrorMessage(
  errorKind: AiErrorKind | undefined,
  opts: { isReceipt: boolean; hasAnyKey: boolean },
): string {
  if (!opts.hasAnyKey || errorKind === "not_configured") {
    return opts.isReceipt
      ? "Scan gambar struk membutuhkan GEMINI_API_KEY (atau AI_BASE_URL + AI_API_KEY) di .env.local. Untuk catat cepat tanpa API key, ketik atau rekam suara transaksi."
      : "Belum ditemukan nominal transaksi. Contoh format: 'Ngopi 25rb pake gopay, parkir 2rb cash'.";
  }
  if (errorKind === "invalid_key") {
    return "API key AI tidak valid atau ditolak server. Periksa kembali GEMINI_API_KEY (atau AI_API_KEY) di .env.local.";
  }
  if (errorKind === "rate_limit") {
    return opts.isReceipt
      ? "Kuota/rate limit AI sedang penuh di semua model cadangan. Tunggu sebentar lalu coba lagi, atau ketik transaksi secara manual."
      : "Kuota AI sedang penuh dan format kalimat belum terbaca parser lokal. Tunggu sebentar atau tulis dengan angka jelas (misal: 'Ngopi 25rb cash').";
  }
  if (errorKind === "unavailable") {
    return "Server AI sedang sibuk/gangguan (termasuk model cadangan). Coba ulangi beberapa saat lagi.";
  }
  return opts.isReceipt
    ? "Struk belum terbaca dengan jelas (nominal tidak terdeteksi). Coba foto ulang yang lebih terang dan fokus."
    : "Belum ditemukan nominal transaksi. Contoh format: 'Ngopi 25rb pake gopay, parkir 2rb cash'.";
}

async function callGeminiModel(
  apiKey: string,
  model: string,
  prompt: string,
  imageBase64?: string,
  mimeType?: string,
): Promise<{ text?: string; errorKind?: AiErrorKind; errorDetail?: string }> {
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (imageBase64 && mimeType) {
    parts.push({ inline_data: { mime_type: mimeType, data: imageBase64 } });
  }

  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.1 },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    return { errorKind: "unavailable", errorDetail: "Koneksi ke Gemini timeout atau terputus" };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const classified = classifyHttpError(res.status, errText);
    return { errorKind: classified.kind, errorDetail: classified.detail };
  }

  const payload = (await res.json().catch(() => ({}))) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    return { errorKind: "unreadable", errorDetail: "Respons model kosong" };
  }
  return { text: rawText };
}

async function callOpenAiCompatibleModel(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  imageBase64?: string,
  mimeType?: string,
): Promise<{ text?: string; errorKind?: AiErrorKind; errorDetail?: string }> {
  const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
  if (imageBase64 && mimeType) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${mimeType};base64,${imageBase64}` },
    });
  }

  const endpoint = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content }],
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { errorKind: "unavailable", errorDetail: "Koneksi ke AI Gateway timeout atau terputus" };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const classified = classifyHttpError(res.status, errText);
    return { errorKind: classified.kind, errorDetail: classified.detail };
  }

  const payload = (await res.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const rawText = payload.choices?.[0]?.message?.content;
  if (!rawText) {
    return { errorKind: "unreadable", errorDetail: "Respons gateway kosong" };
  }
  return { text: rawText };
}

interface FallbackRunResult<T> {
  value?: T;
  engine: "gemini" | "gateway" | null;
  model?: string;
  usedFallback?: boolean;
  errorKind?: AiErrorKind;
  errorDetail?: string;
}

async function runAiWithFallback<T>(opts: {
  prompt: string;
  imageBase64?: string;
  mimeType?: string;
  validate: (rawText: string) => T | null;
}): Promise<FallbackRunResult<T>> {
  const geminiKeys = Array.from(
    new Set(
      [process.env.GEMINI_API_KEY?.trim(), process.env.GEMINI_API_KEY_BACKUP?.trim()].filter(
        (k): k is string => Boolean(k),
      ),
    ),
  );
  const gatewayUrl = process.env.AI_BASE_URL?.trim();
  const gatewayKey = process.env.AI_API_KEY?.trim();
  const hasGateway = Boolean(gatewayUrl && gatewayKey);

  if (geminiKeys.length === 0 && !hasGateway) {
    return { engine: null, errorKind: "not_configured" };
  }

  let lastErrorKind: AiErrorKind | undefined;
  let lastErrorDetail: string | undefined;
  let attempts = 0;

  if (geminiKeys.length > 0) {
    const models = resolveGeminiModelChain(
      process.env.GEMINI_MODEL,
      process.env.GEMINI_FALLBACK_MODELS,
    );
    for (const key of geminiKeys) {
      for (const model of models) {
        attempts += 1;
        const result = await callGeminiModel(
          key,
          model,
          opts.prompt,
          opts.imageBase64,
          opts.mimeType,
        );
        if (result.text) {
          const parsed = opts.validate(result.text);
          if (parsed !== null) {
            return { value: parsed, engine: "gemini", model, usedFallback: attempts > 1 };
          }
          lastErrorKind = "unreadable";
          lastErrorDetail = "Model merespons tapi format tidak terbaca";
          continue;
        }
        lastErrorKind = result.errorKind;
        lastErrorDetail = result.errorDetail;
        if (result.errorKind === "invalid_key") break;
      }
    }
  }

  if (hasGateway && gatewayUrl && gatewayKey) {
    const gatewayModels = (process.env.AI_MODEL || "gemini-3.5-flash-lite")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const model of gatewayModels) {
      attempts += 1;
      const result = await callOpenAiCompatibleModel(
        gatewayUrl,
        gatewayKey,
        model,
        opts.prompt,
        opts.imageBase64,
        opts.mimeType,
      );
      if (result.text) {
        const parsed = opts.validate(result.text);
        if (parsed !== null) {
          return { value: parsed, engine: "gateway", model, usedFallback: attempts > 1 };
        }
        lastErrorKind = "unreadable";
        lastErrorDetail = "Gateway merespons tapi format tidak terbaca";
        continue;
      }
      lastErrorKind = result.errorKind;
      lastErrorDetail = result.errorDetail;
      if (result.errorKind === "invalid_key") break;
    }
  }

  return {
    engine: null,
    errorKind: lastErrorKind || "unreadable",
    errorDetail: lastErrorDetail,
  };
}

/**
 * Parse text or receipt image across configured Gemini keys & fallback models,
 * then optional OpenAI-compatible gateway (e.g. Helipod / OpenRouter).
 */
export async function parseWithAI(params: {
  text?: string;
  imageBase64?: string;
  mimeType?: string;
  accounts: Account[];
  categoriesKeluar: string[];
  categoriesMasuk: string[];
}): Promise<AiParseOutcome> {
  const run = await runAiWithFallback({
    prompt: buildAiPrompt(params),
    imageBase64: params.imageBase64,
    mimeType: params.mimeType,
    validate: (rawText) => {
      const drafts = normalizeRawAiDrafts(rawText, params.accounts);
      return drafts.length > 0 ? drafts : null;
    },
  });
  return {
    drafts: run.value ?? [],
    engine: run.engine,
    model: run.model,
    usedFallback: run.usedFallback,
    errorKind: run.errorKind,
    errorDetail: run.errorDetail,
  };
}

/** Build compact, pre-aggregated ledger facts so LLM answers never rely on raw-row mental math. */
export function buildGuriContextSummary(db: AppDatabase, now: Date = new Date()): string {
  const todayIso = toIsoDate(now);
  const monthSummary = computePeriodMetrics(db.transactions, "month", now);
  const allowance = computeDailyAllowance(
    db.transactions,
    db.settings.monthlyBudget,
    db.settings.paydayDay,
    now,
  );
  const balances = computeAccountBalances(db.accounts, db.transactions);
  const totalBalance = balances.reduce((s, a) => s + a.balance, 0);
  const recentTxs = [...db.transactions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 15)
    .map((tx) => {
      const acc = db.accounts.find((a) => a.id === tx.accountId)?.name || tx.accountId;
      const toAcc = tx.toAccountId
        ? db.accounts.find((a) => a.id === tx.toAccountId)?.name || tx.toAccountId
        : undefined;
      return {
        tanggal: tx.date,
        jenis: tx.type,
        kategori: tx.category,
        akun: toAcc ? `${acc} -> ${toAcc}` : acc,
        nominal: formatRupiah(tx.amount),
        catatan: tx.note || "-",
      };
    });

  return JSON.stringify({
    tanggalHariIni: todayIso,
    totalSaldoSemuaAkun: formatRupiah(totalBalance),
    saldoPerAkun: balances.map((b) => ({ nama: b.name, saldo: formatRupiah(b.balance) })),
    ringkasanBulanIni: {
      pemasukan: formatRupiah(monthSummary.income),
      pengeluaran: formatRupiah(monthSummary.expense),
      selisih: formatRupiah(monthSummary.net),
      rasioSimpan: `${monthSummary.savingRate}%`,
      rataRataHarian: formatRupiah(monthSummary.dailyAverageExpense),
      pengeluaranBulanLalu:
        monthSummary.prevExpense !== null ? formatRupiah(monthSummary.prevExpense) : null,
      perubahanVsBulanLaluPct: monthSummary.expenseDeltaPct,
      pengeluaranPerKategori: monthSummary.expenseByCategory.slice(0, 6).map((c) => ({
        kategori: c.name,
        nominal: formatRupiah(c.amount),
        porsi: `${c.pct}%`,
      })),
    },
    jatahHarianSiklus: {
      periode: `${allowance.cycleStart} s.d. ${allowance.cycleEnd}`,
      targetAnggaran: formatRupiah(db.settings.monthlyBudget),
      jatahHariIni: formatRupiah(allowance.dailyAllowance),
      terpakaiHariIni: formatRupiah(allowance.spentToday),
      sisaHariIni: formatRupiah(allowance.remainingToday),
      proyeksiBesok: formatRupiah(allowance.projectedTomorrow),
      sisaBudgetSiklus: formatRupiah(allowance.remainingBudget),
      sisaHariSiklus: allowance.daysLeftInCycle,
    },
    targetTabungan: db.goals.map((g) => ({
      nama: g.name,
      terkumpul: formatRupiah(g.currentAmount),
      target: formatRupiah(g.targetAmount),
    })),
    transaksiTerbaru: recentTxs,
  });
}

export interface GuriAskOutcome {
  answer: string | null;
  engine: "gemini" | "gateway" | null;
  model?: string;
  errorKind?: AiErrorKind;
  errorDetail?: string;
}

/** Answer user financial questions naturally via LLM grounded strictly on pre-aggregated ledger facts. */
export async function askGuriWithAI(
  question: string,
  db: AppDatabase,
  now: Date = new Date(),
): Promise<GuriAskOutcome> {
  const cleanQ = question.trim();
  if (!cleanQ) {
    return { answer: null, engine: null, errorKind: "unreadable" };
  }

  const contextJson = buildGuriContextSummary(db, now);
  const prompt = [
    "Kamu adalah Guri, asisten keuangan pribadi di aplikasi CatatCepat.",
    "Jawab pertanyaan user dalam Bahasa Indonesia yang ramah, ringkas, dan natural (maksimal 3-4 kalimat, tanpa markdown heading/tabel rumit).",
    "ATURAN KETAT: Gunakan HANYA angka dan fakta dari JSON data keuangan aktual di bawah ini. Jangan mengarang angka, kategori, atau transaksi yang tidak ada. Jika data tidak mencukupi untuk menjawab, katakan jujur dengan sopan.",
    `DATA KEUANGAN USER:\n${contextJson}`,
    `PERTANYAAN USER: ${cleanQ}`,
  ].join("\n\n");

  const run = await runAiWithFallback({
    prompt,
    validate: (raw) => {
      const cleaned = raw.trim().replace(/^```[\w]*\s*|\s*```$/g, "").trim();
      return cleaned ? cleaned.slice(0, 1200) : null;
    },
  });

  return {
    answer: run.value ?? null,
    engine: run.engine,
    model: run.model,
    errorKind: run.errorKind,
    errorDetail: run.errorDetail,
  };
}

/** Backwards-compatible helper returning drafts or null. */
export async function parseWithGemini(params: {
  text?: string;
  imageBase64?: string;
  mimeType?: string;
  accounts: Account[];
  categoriesKeluar: string[];
  categoriesMasuk: string[];
}): Promise<ParsedTransactionDraft[] | null> {
  const outcome = await parseWithAI(params);
  return outcome.drafts.length > 0 ? outcome.drafts : null;
}
