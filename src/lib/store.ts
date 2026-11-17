import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AppDatabase, CategoryItem, Transaction } from "./types.ts";
import { toIsoDate } from "./finance.ts";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "catatcepat-db.json");

export const PRESET_CATEGORIES: Record<
  AppDatabase["settings"]["categoryPreset"],
  { keluar: Array<{ name: string; iconKey: string }>; masuk: Array<{ name: string; iconKey: string }> }
> = {
  asn_karyawan: {
    keluar: [
      { name: "Makanan", iconKey: "utensils" },
      { name: "Transportasi", iconKey: "bus" },
      { name: "Kebutuhan Sehari-hari", iconKey: "basket" },
      { name: "Kado", iconKey: "gift" },
      { name: "Komunikasi", iconKey: "phone" },
      { name: "Pembayaran", iconKey: "receipt" },
      { name: "Tabungan", iconKey: "piggy" },
      { name: "Lain-lain", iconKey: "tag" },
    ],
    masuk: [
      { name: "Gaji", iconKey: "briefcase" },
      { name: "TPP", iconKey: "medal" },
      { name: "TPG", iconKey: "cap" },
      { name: "Bonus", iconKey: "star" },
      { name: "Lain-lain", iconKey: "tag" },
    ],
  },
  umum: {
    keluar: [
      { name: "Makanan", iconKey: "utensils" },
      { name: "Transportasi", iconKey: "bus" },
      { name: "Kebutuhan Sehari-hari", iconKey: "basket" },
      { name: "Tagihan", iconKey: "receipt" },
      { name: "Kesehatan", iconKey: "heart" },
      { name: "Komunikasi", iconKey: "phone" },
      { name: "Tabungan", iconKey: "piggy" },
      { name: "Lain-lain", iconKey: "tag" },
    ],
    masuk: [
      { name: "Gaji Pokok", iconKey: "briefcase" },
      { name: "Tunjangan", iconKey: "medal" },
      { name: "Bonus", iconKey: "star" },
      { name: "Usaha / Sampingan", iconKey: "bag" },
      { name: "Lain-lain", iconKey: "tag" },
    ],
  },
  mahasiswa: {
    keluar: [
      { name: "Makan & Kopi", iconKey: "utensils" },
      { name: "Transportasi", iconKey: "bus" },
      { name: "Kost & Listrik", iconKey: "receipt" },
      { name: "Kuliah & Buku", iconKey: "cap" },
      { name: "Kuota & Pulsa", iconKey: "phone" },
      { name: "Tabungan", iconKey: "piggy" },
      { name: "Lain-lain", iconKey: "tag" },
    ],
    masuk: [
      { name: "Uang Saku", iconKey: "wallet" },
      { name: "Beasiswa", iconKey: "cap" },
      { name: "Part-time / Freelance", iconKey: "briefcase" },
      { name: "Bonus", iconKey: "star" },
    ],
  },
  freelancer: {
    keluar: [
      { name: "Makanan", iconKey: "utensils" },
      { name: "Transportasi", iconKey: "bus" },
      { name: "Internet & Software", iconKey: "phone" },
      { name: "Operasional Kerja", iconKey: "briefcase" },
      { name: "Pajak & Cicilan", iconKey: "receipt" },
      { name: "Tabungan", iconKey: "piggy" },
      { name: "Lain-lain", iconKey: "tag" },
    ],
    masuk: [
      { name: "Proyek Klien", iconKey: "briefcase" },
      { name: "Retainer", iconKey: "medal" },
      { name: "Royalti / Produk", iconKey: "star" },
      { name: "Lain-lain", iconKey: "tag" },
    ],
  },
};

function buildPresetCategoryList(preset: AppDatabase["settings"]["categoryPreset"]): CategoryItem[] {
  const def = PRESET_CATEGORIES[preset] || PRESET_CATEGORIES.asn_karyawan;
  return [
    ...def.keluar.map((c, idx) => ({ id: `cat-k-${idx}`, name: c.name, type: "Keluar" as const, iconKey: c.iconKey })),
    ...def.masuk.map((c, idx) => ({ id: `cat-m-${idx}`, name: c.name, type: "Masuk" as const, iconKey: c.iconKey })),
  ];
}

export { buildPresetCategoryList };

/** Strip encrypted OAuth tokens before sending database state to the client. */
export function toPublicState(db: AppDatabase): AppDatabase {
  const { encryptedRefreshToken: _secret, ...safeConn } = db.sheetConnection;
  return {
    ...db,
    sheetConnection: safeConn,
  };
}

export function createInitialDb(): AppDatabase {
  const hasGoogleConfig = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return {
    settings: {
      name: "Keuangan Pribadi",
      monthlyBudget: 3_000_000,
      paydayDay: 25,
      plan: "free",
      categoryPreset: "asn_karyawan",
    },
    accounts: [
      { id: "acc-cash", name: "Tunai", kind: "cash", initialBalance: 0 },
      { id: "acc-bank", name: "Rekening Bank", kind: "bank", initialBalance: 0 },
      { id: "acc-ewallet", name: "E-Wallet", kind: "ewallet", initialBalance: 0 },
    ],
    categories: buildPresetCategoryList("asn_karyawan"),
    goals: [],
    transactions: [],
    sheetConnection: {
      configured: hasGoogleConfig,
      connected: false,
      sheetTabName: "Transaksi",
    },
  };
}

export function readDb(): AppDatabase {
  if (!fs.existsSync(DB_PATH)) {
    const initial = createInitialDb();
    writeDb(initial);
    return initial;
  }
  const raw = fs.readFileSync(DB_PATH, "utf8");
  const parsed = JSON.parse(raw) as AppDatabase;
  parsed.sheetConnection.configured = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
  return parsed;
}

/** Goal progress is derived from its deposit transactions so edits/deletes in Riwayat stay consistent. */
export function recomputeGoalAmounts(db: AppDatabase): void {
  const totals = new Map<string, number>();
  for (const tx of db.transactions) {
    if (tx.goalId && tx.type === "Keluar") {
      totals.set(tx.goalId, (totals.get(tx.goalId) ?? 0) + tx.amount);
    }
  }
  for (const goal of db.goals) {
    goal.currentAmount = totals.get(goal.id) ?? 0;
  }
}

export function writeDb(db: AppDatabase): void {
  recomputeGoalAmounts(db);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tempPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tempPath, DB_PATH);
}

/** Explicitly load sample simulation transactions when user requests a demo preview. */
export function buildSimulationTransactions(now: Date = new Date()): Transaction[] {
  const shiftDate = (daysAgo: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
    return toIsoDate(d);
  };
  const isoNow = now.toISOString();

  return [
    {
      id: randomUUID(),
      date: shiftDate(4),
      type: "Masuk",
      category: "Gaji",
      accountId: "acc-bank",
      amount: 5_200_000,
      note: "[Contoh] Gaji bulanan",
      source: "manual",
      sheetSyncStatus: "local_only",
      createdAt: isoNow,
      updatedAt: isoNow,
    },
    {
      id: randomUUID(),
      date: shiftDate(3),
      type: "Keluar",
      category: "Kebutuhan Sehari-hari",
      accountId: "acc-ewallet",
      amount: 145_000,
      note: "[Contoh] Belanja kebutuhan harian",
      source: "manual",
      sheetSyncStatus: "local_only",
      createdAt: isoNow,
      updatedAt: isoNow,
    },
    {
      id: randomUUID(),
      date: shiftDate(2),
      type: "Keluar",
      category: "Transportasi",
      accountId: "acc-cash",
      amount: 35_000,
      note: "[Contoh] Bensin & parkir",
      source: "ai_text",
      sheetSyncStatus: "local_only",
      createdAt: isoNow,
      updatedAt: isoNow,
    },
    {
      id: randomUUID(),
      date: shiftDate(1),
      type: "Keluar",
      category: "Makanan",
      accountId: "acc-ewallet",
      amount: 42_000,
      note: "[Contoh] Makan siang & kopi",
      source: "ai_text",
      sheetSyncStatus: "local_only",
      createdAt: isoNow,
      updatedAt: isoNow,
    },
    {
      id: randomUUID(),
      date: shiftDate(0),
      type: "Keluar",
      category: "Makanan",
      accountId: "acc-cash",
      amount: 25_000,
      note: "[Contoh] Sarapan pagi",
      source: "manual",
      sheetSyncStatus: "local_only",
      createdAt: isoNow,
      updatedAt: isoNow,
    },
  ];
}

/** Parse CSV exported from legacy CatatCepat ("Tanggal,Jenis,Nominal,Kategori,Keterangan"). */
export function parseLegacyCsv(csvText: string, defaultAccountId: string): Transaction[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const splitCsvLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const results: Transaction[] = [];
  const nowIso = new Date().toISOString();

  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < 4) continue;
    const rawDate = cols[0];
    let isoDate = toIsoDate();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawDate)) {
      const [dd, mm, yyyy] = rawDate.split("/");
      isoDate = `${yyyy}-${mm}-${dd}`;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      isoDate = rawDate;
    }

    const jenis = cols[1] === "Masuk" ? "Masuk" : "Keluar";
    const nominal = parseInt(cols[2].replace(/\D/g, ""), 10) || 0;
    if (nominal <= 0) continue;

    results.push({
      id: randomUUID(),
      date: isoDate,
      type: jenis,
      category: cols[3] || "Lain-lain",
      accountId: defaultAccountId,
      amount: nominal,
      note: cols[4] || "",
      source: "import_csv",
      sheetSyncStatus: "pending",
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  return results;
}
