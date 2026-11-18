import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { CATEGORY_ICON_OPTIONS, type AppDatabase, type CategoryItem, type Transaction } from "./types.ts";
import { toIsoDate } from "./finance.ts";
import {
  getActiveSessionFromCookies,
  isSupabaseConfigured,
  readSupabaseWorkspace,
  type SupabaseSession,
  writeSupabaseWorkspaceDelta,
} from "./supabase.ts";

const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "catatcepat-data")
  : path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "catatcepat-db.json");

export const DEFAULT_EXPENSE_CATEGORIES: Array<{ name: string; iconKey: string }> = [
  { name: "Makan & Minum", iconKey: "utensils" },
  { name: "Transportasi & Bensin", iconKey: "bus" },
  { name: "Listrik & Air", iconKey: "bolt" },
  { name: "Pulsa & Kuota", iconKey: "phone" },
  { name: "Kesehatan & Obat", iconKey: "heart" },
  { name: "Sedekah & Donasi", iconKey: "gift" },
  { name: "Belanja", iconKey: "bag" },
  { name: "Pendidikan", iconKey: "cap" },
  { name: "Lain-lain", iconKey: "tag" },
];

export const PRESET_CATEGORIES: Record<
  AppDatabase["settings"]["categoryPreset"],
  { keluar: Array<{ name: string; iconKey: string }>; masuk: Array<{ name: string; iconKey: string }> }
> = {
  asn_karyawan: {
    keluar: DEFAULT_EXPENSE_CATEGORIES,
    masuk: [
      { name: "Gaji", iconKey: "briefcase" },
      { name: "Tunjangan", iconKey: "medal" },
      { name: "Bonus", iconKey: "star" },
      { name: "THR", iconKey: "gift" },
      { name: "Lain-lain", iconKey: "tag" },
    ],
  },
  umum: {
    keluar: DEFAULT_EXPENSE_CATEGORIES,
    masuk: [
      { name: "Gaji", iconKey: "briefcase" },
      { name: "Tunjangan", iconKey: "medal" },
      { name: "Bonus", iconKey: "star" },
      { name: "Usaha Sampingan", iconKey: "bag" },
      { name: "Lain-lain", iconKey: "tag" },
    ],
  },
  mahasiswa: {
    keluar: DEFAULT_EXPENSE_CATEGORIES,
    masuk: [
      { name: "Uang Saku", iconKey: "wallet" },
      { name: "Beasiswa", iconKey: "cap" },
      { name: "Lain-lain", iconKey: "tag" },
    ],
  },
  freelancer: {
    keluar: DEFAULT_EXPENSE_CATEGORIES,
    masuk: [
      { name: "Proyek Klien", iconKey: "laptop" },
      { name: "Retainer", iconKey: "medal" },
      { name: "Royalti", iconKey: "star" },
      { name: "Produk", iconKey: "bag" },
      { name: "Lain-lain", iconKey: "tag" },
    ],
  },
};

function buildPresetCategoryList(preset: AppDatabase["settings"]["categoryPreset"]): CategoryItem[] {
  const def = PRESET_CATEGORIES[preset] || PRESET_CATEGORIES.umum;
  return [
    ...def.keluar.map((c, idx) => ({ id: `cat-k-${idx}`, name: c.name, type: "Keluar" as const, iconKey: c.iconKey })),
    ...def.masuk.map((c, idx) => ({ id: `cat-m-${idx}`, name: c.name, type: "Masuk" as const, iconKey: c.iconKey })),
  ];
}

export { buildPresetCategoryList };

export const ALLOWED_CATEGORY_ICONS = new Set<string>(CATEGORY_ICON_OPTIONS.map((o) => o.key));

/**
 * Update a category's name and/or icon; when renamed, propagate to matching transactions
 * so Riwayat and Statistik stay synchronized.
 */
export function updateCategoryInDb(
  db: AppDatabase,
  categoryId: string,
  updates: { name?: string; iconKey?: string },
): { ok: true; transactionsChanged: boolean } | { ok: false; status: number; error: string } {
  const cat = db.categories.find((c) => c.id === categoryId);
  if (!cat) {
    return { ok: false, status: 404, error: "Kategori tidak ditemukan." };
  }

  let transactionsChanged = false;
  if (updates.name !== undefined) {
    const cleanName = updates.name.trim().slice(0, 40);
    if (!cleanName) {
      return { ok: false, status: 400, error: "Nama kategori wajib diisi." };
    }
    const duplicate = db.categories.some(
      (c) =>
        c.id !== cat.id &&
        c.type === cat.type &&
        c.name.toLowerCase() === cleanName.toLowerCase(),
    );
    if (duplicate) {
      return { ok: false, status: 400, error: `Kategori "${cleanName}" sudah ada.` };
    }
    if (cleanName !== cat.name) {
      const oldName = cat.name;
      const nowIso = new Date().toISOString();
      cat.name = cleanName;
      for (const tx of db.transactions) {
        if (tx.type === cat.type && tx.category === oldName) {
          tx.category = cleanName;
          tx.updatedAt = nowIso;
          if (db.sheetConnection.connected) tx.sheetSyncStatus = "pending";
          transactionsChanged = true;
        }
      }
    }
  }

  if (updates.iconKey !== undefined) {
    if (!ALLOWED_CATEGORY_ICONS.has(updates.iconKey)) {
      return { ok: false, status: 400, error: "Pilihan ikon tidak valid." };
    }
    cat.iconKey = updates.iconKey;
  }

  return { ok: true, transactionsChanged };
}

/**
 * Delete a category; if existing transactions use it, require and reassign them to a
 * user-selected replacement category of the same type.
 */
export function deleteCategoryInDb(
  db: AppDatabase,
  categoryId: string,
  replacementCategory?: string,
): { ok: true; transactionsChanged: boolean } | { ok: false; status: number; error: string } {
  const target = db.categories.find((c) => c.id === categoryId);
  if (!target) {
    return { ok: false, status: 404, error: "Kategori tidak ditemukan." };
  }

  const remainingSameType = db.categories.filter(
    (c) => c.id !== target.id && c.type === target.type,
  );
  if (remainingSameType.length === 0) {
    return { ok: false, status: 400, error: "Minimal harus ada 1 kategori tersisa." };
  }

  const affected = db.transactions.filter(
    (tx) => tx.type === target.type && tx.category === target.name,
  );
  let transactionsChanged = false;
  if (affected.length > 0) {
    const replacement = (replacementCategory || "").trim();
    const validTarget = remainingSameType.some((c) => c.name === replacement);
    if (!validTarget) {
      return {
        ok: false,
        status: 400,
        error: "Pilih kategori tujuan yang valid untuk memindahkan transaksi yang ada.",
      };
    }
    const nowIso = new Date().toISOString();
    for (const tx of affected) {
      tx.category = replacement;
      tx.updatedAt = nowIso;
      if (db.sheetConnection.connected) tx.sheetSyncStatus = "pending";
    }
    transactionsChanged = true;
  }

  db.categories = db.categories.filter((c) => c.id !== target.id);
  return { ok: true, transactionsChanged };
}

/** Reorder categories of one transaction type while preserving all categories of the other type. */
export function reorderCategoriesInDb(
  db: AppDatabase,
  catType: "Masuk" | "Keluar",
  orderedIds: string[],
): { ok: true } | { ok: false; status: number; error: string } {
  const sameType = db.categories.filter((c) => c.type === catType);
  if (orderedIds.length !== sameType.length) {
    return { ok: false, status: 400, error: "Daftar urutan kategori tidak lengkap." };
  }
  const byId = new Map(sameType.map((c) => [c.id, c]));
  const reordered: CategoryItem[] = [];
  const seen = new Set<string>();
  for (const id of orderedIds) {
    if (seen.has(id)) {
      return { ok: false, status: 400, error: "Urutan kategori mengandung duplikat." };
    }
    const item = byId.get(id);
    if (!item) {
      return { ok: false, status: 400, error: "Kategori dalam urutan tidak valid." };
    }
    seen.add(id);
    reordered.push(item);
  }
  const others = db.categories.filter((c) => c.type !== catType);
  db.categories = catType === "Keluar" ? [...reordered, ...others] : [...others, ...reordered];
  return { ok: true };
}

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
      categoryPreset: "umum",
    },
    accounts: [
      { id: "acc-cash", name: "Tunai", kind: "cash", initialBalance: 0 },
      { id: "acc-bank", name: "Rekening Bank", kind: "bank", initialBalance: 0 },
      { id: "acc-ewallet", name: "E-Wallet", kind: "ewallet", initialBalance: 0 },
    ],
    categories: buildPresetCategoryList("umum"),
    goals: [],
    transactions: [],
    sheetConnection: {
      configured: hasGoogleConfig,
      connected: false,
      sheetTabName: "Transaksi",
    },
    auth: {
      configured: isSupabaseConfigured(),
      authenticated: false,
      mode: "local",
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
  parsed.auth = {
    configured: isSupabaseConfigured(),
    authenticated: false,
    mode: "local",
  };
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

interface SupabaseTrackedContext {
  session: SupabaseSession;
  workspaceId: string;
  baseline: AppDatabase;
}

const supabaseContextMap = new WeakMap<AppDatabase, SupabaseTrackedContext>();

export async function readAsyncDb(): Promise<AppDatabase> {
  if (isSupabaseConfigured()) {
    const session = await getActiveSessionFromCookies();
    if (session) {
      const { workspaceId, db } = await readSupabaseWorkspace(session, createInitialDb());
      recomputeGoalAmounts(db);
      supabaseContextMap.set(db, {
        session,
        workspaceId,
        baseline: structuredClone(db),
      });
      return db;
    }
  }
  return readDb();
}

export async function writeAsyncDb(db: AppDatabase): Promise<void> {
  recomputeGoalAmounts(db);
  const tracked = supabaseContextMap.get(db);
  if (tracked) {
    await writeSupabaseWorkspaceDelta(
      tracked.session,
      tracked.workspaceId,
      tracked.baseline,
      db,
    );
    tracked.baseline = structuredClone(db);
    return;
  }
  writeDb(db);
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
      category: "Belanja",
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
      category: "Transportasi & Bensin",
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
      category: "Makan & Minum",
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
      category: "Makan & Minum",
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
    if (/^\d{2}[/-]\d{2}[/-]\d{4}$/.test(rawDate)) {
      const [dd, mm, yyyy] = rawDate.split(/[/-]/);
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
