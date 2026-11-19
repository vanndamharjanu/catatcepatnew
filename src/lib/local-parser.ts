import type { Account, ParsedTransactionDraft, TransactionType } from "./types.ts";
import { toIsoDate } from "./finance.ts";

function makeTempId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const CATEGORY_KEYWORDS: Array<{ category: string; type: "Masuk" | "Keluar"; words: string[] }> = [
  { category: "Gaji", type: "Masuk", words: ["gaji", "salary", "payroll"] },
  { category: "Tunjangan", type: "Masuk", words: ["tunjangan", "tpp", "tpg", "sertifikasi"] },
  { category: "THR", type: "Masuk", words: ["thr"] },
  { category: "Usaha Sampingan", type: "Masuk", words: ["usaha sampingan", "jualan", "dagang", "orderan"] },
  { category: "Uang Saku", type: "Masuk", words: ["uang saku", "kiriman ortu", "kiriman orang tua"] },
  { category: "Beasiswa", type: "Masuk", words: ["beasiswa", "stipend"] },
  { category: "Proyek Klien", type: "Masuk", words: ["proyek", "project", "klien", "client", "freelance", "bayaran"] },
  { category: "Retainer", type: "Masuk", words: ["retainer"] },
  { category: "Royalti", type: "Masuk", words: ["royalti", "royalty"] },
  { category: "Produk", type: "Masuk", words: ["penjualan produk", "ebook", "template"] },
  { category: "Bonus", type: "Masuk", words: ["bonus", "insentif", "komisi"] },
  { category: "Makan & Minum", type: "Keluar", words: ["makan", "ngopi", "kopi", "sarapan", "lunch", "dinner", "bakso", "nasi", "minum", "jajan", "snack", "warteg", "boba", "mie", "telur"] },
  { category: "Transportasi & Bensin", type: "Keluar", words: ["parkir", "bensin", "pertalite", "pertamax", "gojek", "grab", "ojek", "tol", "kereta", "krl", "mrt", "bus", "transjakarta", "grabcar"] },
  { category: "Listrik & Air", type: "Keluar", words: ["listrik", "pln", "token listrik", "pdam", "tagihan air"] },
  { category: "Pulsa & Kuota", type: "Keluar", words: ["pulsa", "kuota", "paket data", "wifi", "internet", "telkom"] },
  { category: "Kesehatan & Obat", type: "Keluar", words: ["obat", "apotek", "dokter", "klinik", "rumah sakit", "bpjs", "kesehatan", "vitamin"] },
  { category: "Sedekah & Donasi", type: "Keluar", words: ["sedekah", "donasi", "infaq", "zakat", "sumbangan", "santunan", "amal"] },
  { category: "Pendidikan", type: "Keluar", words: ["kuliah", "ukt", "spp", "sekolah", "kursus", "buku", "les", "seminar", "pelatihan"] },
  { category: "Belanja", type: "Keluar", words: ["sabun", "beras", "indomaret", "alfamart", "belanja", "supermarket", "galon", "gas", "baju", "sepatu", "tokopedia", "shopee", "tagihan", "cicilan", "sewa", "kost", "kontrakan", "kado", "hadiah"] },
];

function normalizeNumber(raw: string, unit?: string): number {
  const lowerUnit = (unit || "").toLowerCase();
  if (lowerUnit === "jt" || lowerUnit === "juta") {
    return Math.round(parseFloat(raw.replace(",", ".")) * 1_000_000);
  }
  if (lowerUnit === "rb" || lowerUnit === "ribu" || lowerUnit === "k") {
    return Math.round(parseFloat(raw.replace(",", ".")) * 1_000);
  }
  const digits = raw.replace(/[.,]/g, "");
  return parseInt(digits, 10) || 0;
}

function parseAmountToken(segment: string): number {
  const discountMatch = segment.match(
    /(\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta)?\s*(?:diskon|potongan|cashback)\s*(\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta)?/i,
  );
  if (discountMatch) {
    const gross = normalizeNumber(discountMatch[1], discountMatch[2]);
    const disc = normalizeNumber(discountMatch[3], discountMatch[4]);
    return Math.max(0, gross - disc);
  }

  const matches = Array.from(
    segment.matchAll(/(?:rp\.?\s*)?(\d+(?:[.,]\d+)*)\s*(rb|ribu|k|jt|juta)?\b/gi),
  );
  for (const m of matches) {
    const rawNum = m[1];
    const unit = m[2];
    if (!unit && rawNum.length === 4 && Number(rawNum) >= 2020 && Number(rawNum) <= 2035) {
      continue;
    }
    const val = normalizeNumber(rawNum, unit);
    if (val > 0) return val;
  }
  return 0;
}

function inferAccount(segment: string, accounts: Account[]): string {
  const lower = segment.toLowerCase();
  const exactByName = accounts.find(
    (a) => a.name.length >= 3 && lower.includes(a.name.toLowerCase()),
  );
  if (exactByName) return exactByName.id;

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

/** Deterministic Indonesian multi-transaction parser usable in both server and browser. */
export function parseIndonesianTransactionsLocal(
  text: string,
  accounts: Account[],
  defaultDate: string = toIsoDate(),
): ParsedTransactionDraft[] {
  // Split on newlines, semicolons, or commas NOT flanked by digits (preserves Indonesian decimals like "5,2 juta").
  const segments = text
    .split(/(?:[\n;]+|(?<!\d),|,(?!\d))+/)
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

    const transferMatch = lower.match(/dari\s+([a-z0-9\s-]+?)\s+ke\s+([a-z0-9\s-]+)/i);
    if (lower.includes("transfer") && transferMatch) {
      const fromAcc = inferAccount(transferMatch[1], accounts);
      const toAcc = inferAccount(transferMatch[2], accounts);
      drafts.push({
        tempId: makeTempId(),
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

    const cleanedNote = seg.charAt(0).toUpperCase() + seg.slice(1);

    drafts.push({
      tempId: makeTempId(),
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
