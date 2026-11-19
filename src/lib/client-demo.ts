"use client";

import { toIsoDate } from "./finance";
import type {
  AppDatabase,
  RecurringTemplate,
  SavingGoal,
  Transaction,
  TransactionType,
} from "./types";

const DEMO_DB_KEY = "catatcepat_demo_db_v1";
const OFFLINE_QUEUE_KEY = "catatcepat_offline_queue_v1";
const EXTRAS_PREFIX = "catatcepat_extras_v1_";

export interface QueuedTransactionPayload {
  clientTempId: string;
  date: string;
  type: TransactionType;
  category: string;
  accountId: string;
  toAccountId?: string;
  amount: number;
  note: string;
  createdAt: string;
}

export interface WorkspaceExtras {
  recurring: RecurringTemplate[];
  categoryBudgets: Record<string, number>;
}

/** Client-side formula escape for CSV export (mirrors server sanitizeSpreadsheetCell). */
export function escapeCsvCell(value: string): string {
  const safe = /^\s*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Recompute goal currentAmount totals from matching deposit transactions. */
export function recomputeGoalsClient(db: AppDatabase): AppDatabase {
  const totals = new Map<string, number>();
  for (const tx of db.transactions) {
    if (tx.goalId && tx.type === "Keluar") {
      totals.set(tx.goalId, (totals.get(tx.goalId) ?? 0) + tx.amount);
    }
  }
  return {
    ...db,
    goals: db.goals.map((g) => ({
      ...g,
      currentAmount: totals.get(g.id) ?? 0,
    })),
  };
}

export function buildDemoSampleTransactions(now: Date = new Date()): Transaction[] {
  const shiftDate = (daysAgo: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
    return toIsoDate(d);
  };
  const isoNow = now.toISOString();
  const makeId = (suffix: string) => `demo-${suffix}-${Math.random().toString(36).slice(2, 8)}`;

  return [
    {
      id: makeId("gaji"),
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
      id: makeId("belanja"),
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
      id: makeId("bensin"),
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
      id: makeId("kopi"),
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
      id: makeId("sarapan"),
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

/** Load isolated browser-local Demo database, seeding helpful sample rows on first visit. */
export function loadDemoDb(fallbackBase: AppDatabase): AppDatabase {
  try {
    const raw = localStorage.getItem(DEMO_DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppDatabase;
      if (parsed && Array.isArray(parsed.accounts) && Array.isArray(parsed.transactions)) {
        return recomputeGoalsClient({
          ...parsed,
          sheetConnection: {
            ...parsed.sheetConnection,
            configured: fallbackBase.sheetConnection.configured,
            connected: false,
          },
          auth: fallbackBase.auth,
        });
      }
    }
  } catch {
    // Ignore corrupt localStorage and re-seed cleanly
  }
  const seeded: AppDatabase = {
    ...fallbackBase,
    accounts: fallbackBase.accounts.map((a) =>
      a.id === "acc-cash"
        ? { ...a, initialBalance: 350_000 }
        : a.id === "acc-ewallet"
          ? { ...a, initialBalance: 450_000 }
          : a,
    ),
    transactions: buildDemoSampleTransactions(),
    goals: [
      {
        id: "demo-goal-1",
        name: "Dana Darurat Keluarga",
        targetAmount: 10_000_000,
        currentAmount: 0,
        createdAt: new Date().toISOString(),
      },
    ],
  };
  saveDemoDb(seeded);
  return seeded;
}

export function saveDemoDb(db: AppDatabase): void {
  try {
    localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db));
  } catch {
    // Ignore storage quota errors in private browsing
  }
}

export function readBrowserDemoExport(): { transactions: Transaction[]; goals: SavingGoal[] } {
  try {
    const raw = localStorage.getItem(DEMO_DB_KEY);
    if (!raw) return { transactions: [], goals: [] };
    const parsed = JSON.parse(raw) as Partial<AppDatabase>;
    return {
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
    };
  } catch {
    return { transactions: [], goals: [] };
  }
}

export function loadOfflineQueue(): QueuedTransactionPayload[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOfflineQueue(items: QueuedTransactionPayload[]): void {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
  } catch {
    // Ignore quota errors
  }
}

export function loadWorkspaceExtras(scopeKey: string): WorkspaceExtras {
  try {
    const raw = localStorage.getItem(`${EXTRAS_PREFIX}${scopeKey}`);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WorkspaceExtras>;
      return {
        recurring: Array.isArray(parsed.recurring) ? parsed.recurring : [],
        categoryBudgets:
          parsed.categoryBudgets && typeof parsed.categoryBudgets === "object"
            ? parsed.categoryBudgets
            : {},
      };
    }
  } catch {
    // Fall back to empty extras
  }
  return { recurring: [], categoryBudgets: {} };
}

export function saveWorkspaceExtras(scopeKey: string, extras: WorkspaceExtras): void {
  try {
    localStorage.setItem(`${EXTRAS_PREFIX}${scopeKey}`, JSON.stringify(extras));
  } catch {
    // Ignore storage quota errors
  }
}
