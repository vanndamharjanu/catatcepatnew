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
  encryptedRefreshToken?: string;
  lastSyncedAt?: string;
  lastError?: string;
}

export interface WorkspaceSettings {
  name: string;
  monthlyBudget: number;
  paydayDay: number;
  plan: "free" | "pro";
  categoryPreset: "umum" | "asn_karyawan" | "mahasiswa" | "freelancer";
}

export interface AppDatabase {
  settings: WorkspaceSettings;
  accounts: Account[];
  categories: CategoryItem[];
  goals: SavingGoal[];
  transactions: Transaction[];
  sheetConnection: SheetConnection;
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
