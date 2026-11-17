import assert from "node:assert/strict";
import { parseIndonesianTransactionsLocal } from "../src/lib/ai-parser.ts";
import {
  computeAccountBalances,
  computeDailyAllowance,
  computePeriodMetrics,
  computeStreak,
} from "../src/lib/finance.ts";
import { parseLegacyCsv } from "../src/lib/store.ts";
import type { Account, Transaction } from "../src/lib/types.ts";

const sampleAccounts: Account[] = [
  { id: "acc-cash", name: "Tunai", kind: "cash", initialBalance: 0 },
  { id: "acc-bank", name: "Rekening Bank", kind: "bank", initialBalance: 0 },
  { id: "acc-ewallet", name: "E-Wallet", kind: "ewallet", initialBalance: 0 },
];

function runTests() {
  // 1. Multi-transaction + discount + transfer parsing
  const drafts = parseIndonesianTransactionsLocal(
    "Ngopi 25rb pake gopay, beli telur 100rb diskon 10rb cash, gaji masuk bca 5jt, transfer 200rb dari bca ke cash",
    sampleAccounts,
    "2026-11-17",
  );
  assert.equal(drafts.length, 4);
  assert.equal(drafts[0].amount, 25_000);
  assert.equal(drafts[0].accountId, "acc-ewallet");
  assert.equal(drafts[0].category, "Makanan");

  assert.equal(drafts[1].amount, 90_000);
  assert.equal(drafts[1].accountId, "acc-cash");

  assert.equal(drafts[2].type, "Masuk");
  assert.equal(drafts[2].amount, 5_000_000);
  assert.equal(drafts[2].accountId, "acc-bank");

  assert.equal(drafts[3].type, "Transfer");
  assert.equal(drafts[3].accountId, "acc-bank");
  assert.equal(drafts[3].toAccountId, "acc-cash");

  // 2. Daily allowance & tomorrow projection
  const now = new Date(2026, 10, 17); // 2026-11-17
  const txs: Transaction[] = [
    {
      id: "1",
      date: "2026-11-16",
      type: "Masuk",
      category: "Gaji",
      accountId: "acc-bank",
      amount: 3_000_000,
      note: "",
      source: "manual",
      sheetSyncStatus: "local_only",
      createdAt: "2026-11-16T00:00:00Z",
      updatedAt: "2026-11-16T00:00:00Z",
    },
    {
      id: "2",
      date: "2026-11-17",
      type: "Keluar",
      category: "Makanan",
      accountId: "acc-cash",
      amount: 20_000,
      note: "",
      source: "manual",
      sheetSyncStatus: "local_only",
      createdAt: "2026-11-17T01:00:00Z",
      updatedAt: "2026-11-17T01:00:00Z",
    },
    // Prior year transaction in November must NOT mix into current year monthly metrics!
    {
      id: "3",
      date: "2025-11-17",
      type: "Keluar",
      category: "Makanan",
      accountId: "acc-cash",
      amount: 999_000,
      note: "Tahun lalu",
      source: "manual",
      sheetSyncStatus: "local_only",
      createdAt: "2025-11-17T01:00:00Z",
      updatedAt: "2025-11-17T01:00:00Z",
    },
  ];

  const allowance = computeDailyAllowance(txs, 1_600_000, 1, now); // 14 days left (17..30)
  assert.equal(allowance.daysLeftInCycle, 14);
  assert.equal(allowance.spentToday, 20_000);
  assert.equal(allowance.spentInCycle, 20_000);

  // 3. Month+Year isolation & income/custom date period filters
  const metrics = computePeriodMetrics(txs, "month", now);
  assert.equal(metrics.expense, 20_000);
  assert.equal(metrics.income, 3_000_000);
  assert.equal(metrics.incomeByCategory[0]?.name, "Gaji");
  assert.equal(metrics.incomeByCategory[0]?.pct, 100);
  assert.equal(metrics.savingRate, 99);

  const prevYearMonth = computePeriodMetrics(
    txs,
    { kind: "month", monthKey: "2025-11" },
    now,
  );
  assert.equal(prevYearMonth.expense, 999_000);
  assert.equal(prevYearMonth.income, 0);

  const customWindow = computePeriodMetrics(
    txs,
    { kind: "custom", startDate: "2026-11-16", endDate: "2026-11-16" },
    now,
  );
  assert.equal(customWindow.income, 3_000_000);
  assert.equal(customWindow.expense, 0);

  // 4. Streak & balances
  const streak = computeStreak(txs, now);
  assert.equal(streak.streakDays, 2);
  assert.equal(streak.recordedToday, true);

  const balances = computeAccountBalances(sampleAccounts, txs);
  assert.equal(balances.find((b) => b.id === "acc-bank")?.balance, 3_000_000);
  assert.equal(balances.find((b) => b.id === "acc-cash")?.balance, -1_019_000);

  // 5. Balance reconciliation (Koreksi) updates account balance without skewing income/expense
  const reconciledTxs: Transaction[] = [
    ...txs,
    {
      id: "4",
      date: "2026-11-17",
      type: "Koreksi",
      category: "Koreksi Tambah",
      accountId: "acc-ewallet",
      amount: 150_000,
      note: "Saldo awal e-wallet",
      source: "reconciliation",
      sheetSyncStatus: "local_only",
      createdAt: "2026-11-17T02:00:00Z",
      updatedAt: "2026-11-17T02:00:00Z",
    },
    {
      id: "5",
      date: "2026-11-17",
      type: "Koreksi",
      category: "Koreksi Kurang",
      accountId: "acc-bank",
      amount: 25_000,
      note: "Biaya admin",
      source: "reconciliation",
      sheetSyncStatus: "local_only",
      createdAt: "2026-11-17T02:05:00Z",
      updatedAt: "2026-11-17T02:05:00Z",
    },
  ];

  const reconciledBalances = computeAccountBalances(sampleAccounts, reconciledTxs);
  assert.equal(reconciledBalances.find((b) => b.id === "acc-ewallet")?.balance, 150_000);
  assert.equal(reconciledBalances.find((b) => b.id === "acc-bank")?.balance, 2_975_000);

  const metricsAfterReconcile = computePeriodMetrics(reconciledTxs, "month", now);
  assert.equal(metricsAfterReconcile.income, 3_000_000);
  assert.equal(metricsAfterReconcile.expense, 20_000);

  // 6. Legacy CSV import compatibility
  const csvSample = [
    "Tanggal,Jenis,Nominal,Kategori,Keterangan",
    '"16/11/2026","Keluar",25000,"Makan & Minum","Nasi Padang"',
  ].join("\n");
  const imported = parseLegacyCsv(csvSample, "acc-cash");
  assert.equal(imported.length, 1);
  assert.equal(imported[0].date, "2026-11-16");
  assert.equal(imported[0].amount, 25_000);

  console.log("ALL CORE TESTS PASSED (6/6)");
}

runTests();
