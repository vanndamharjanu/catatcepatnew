export const APP_SLOGAN = "Catat 3 Detik, Rapi di Sheets";

export type ThemeKey = "maroon" | "teal" | "indigo" | "amber" | "coral" | "emerald";

export const THEME_OPTIONS: ReadonlyArray<{
  key: ThemeKey;
  label: string;
  swatch: string;
}> = [
  { key: "maroon", label: "Maroon", swatch: "#6E1128" },
  { key: "teal", label: "Teal", swatch: "#0F766E" },
  { key: "indigo", label: "Indigo", swatch: "#4338CA" },
  { key: "amber", label: "Amber", swatch: "#B45309" },
  { key: "coral", label: "Coral", swatch: "#B91C1C" },
  { key: "emerald", label: "Emerald", swatch: "#047857" },
];

export type TransactionType = "Masuk" | "Keluar" | "Transfer" | "Koreksi";

export type AccountKind = "cash" | "bank" | "ewallet";

export type TransactionSource =
  | "manual"
  | "ai_text"
  | "ai_voice"
  | "receipt"
  | "import_csv"
  | "reconciliation";

export type SheetSyncStatus = "pending" | "synced" | "failed" | "local_only";

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  initialBalance: number;
}

export interface CategoryItem {
  id: string;
  name: string;
  type: "Masuk" | "Keluar";
  iconKey: string;
}

export const CATEGORY_ICON_OPTIONS = [
  { key: "utensils", label: "Makan" },
  { key: "coffee", label: "Kopi / Minum" },
  { key: "basket", label: "Belanja Harian" },
  { key: "bag", label: "Belanja" },
  { key: "bus", label: "Transportasi" },
  { key: "car", label: "Mobil / Ojol" },
  { key: "fuel", label: "Bensin" },
  { key: "home", label: "Rumah / Kost" },
  { key: "bolt", label: "Listrik / Air" },
  { key: "phone", label: "Pulsa / HP" },
  { key: "wifi", label: "Internet / WiFi" },
  { key: "receipt", label: "Tagihan" },
  { key: "heart", label: "Kesehatan" },
  { key: "cap", label: "Pendidikan" },
  { key: "book", label: "Buku / Kursus" },
  { key: "gift", label: "Hadiah / Sedekah" },
  { key: "users", label: "Keluarga" },
  { key: "shirt", label: "Pakaian" },
  { key: "game", label: "Hiburan / Game" },
  { key: "film", label: "Streaming / Nonton" },
  { key: "plane", label: "Liburan / Travel" },
  { key: "wrench", label: "Servis" },
  { key: "savings", label: "Tabungan" },
  { key: "wallet", label: "Dompet / Tunai" },
  { key: "card", label: "Kartu / Cicilan" },
  { key: "bank", label: "Bank" },
  { key: "briefcase", label: "Gaji / Kerja" },
  { key: "laptop", label: "Freelance / Kerja" },
  { key: "chart", label: "Investasi" },
  { key: "medal", label: "Tunjangan" },
  { key: "star", label: "Bonus" },
  { key: "tag", label: "Lain-lain" },
] as const;

export interface SavingGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  type: TransactionType;
  category: string;
  accountId: string;
  toAccountId?: string;
  amount: number;
  note: string;
  goalId?: string;
  source: TransactionSource;
  sheetSyncStatus: SheetSyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SheetConnection {
  configured: boolean;
  connected: boolean;
  googleEmail?: string;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  sheetTabName: string;
  sheetTabId?: number;
  encryptedRefreshToken?: string;
  lastSyncedAt?: string;
  lastError?: string;
  pendingDeletes?: string[];
}

export interface WorkspaceSettings {
  name: string;
  monthlyBudget: number;
  paydayDay: number;
  plan: "free" | "pro";
  categoryPreset: "umum" | "asn_karyawan" | "mahasiswa" | "freelancer";
  aiCreditsRemaining?: number;
}

export interface RecurringTemplate {
  id: string;
  name: string;
  type: "Masuk" | "Keluar";
  category: string;
  accountId: string;
  amount: number;
  dayOfMonth: number; // 1..31
  lastRecordedMonth?: string; // YYYY-MM
}

export interface AuthStatus {
  configured: boolean;
  authenticated: boolean;
  mode: "local" | "supabase";
  email?: string;
  userId?: string;
}

export interface AppDatabase {
  settings: WorkspaceSettings;
  accounts: Account[];
  categories: CategoryItem[];
  goals: SavingGoal[];
  transactions: Transaction[];
  hasMoreTransactions?: boolean;
  sheetConnection: SheetConnection;
  auth?: AuthStatus;
}

export interface ParsedTransactionDraft {
  tempId: string;
  date: string;
  type: TransactionType;
  category: string;
  accountId: string;
  toAccountId?: string;
  amount: number;
  note: string;
  confidence: "high" | "medium";
}
