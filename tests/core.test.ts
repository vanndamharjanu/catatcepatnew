import assert from "node:assert/strict";
import { parseIndonesianTransactionsLocal } from "../src/lib/ai-parser.ts";
import {
  computeAccountBalances,
  computeDailyAllowance,
  computePeriodMetrics,
  computeStreak,
  countElapsedDays,
} from "../src/lib/finance.ts";
import {
  deleteCategoryInDb,
  parseLegacyCsv,
  PRESET_CATEGORIES,
  recomputeGoalAmounts,
  reorderCategoriesInDb,
  updateCategoryInDb,
} from "../src/lib/store.ts";
import { CATEGORY_ICON_OPTIONS, type Account, type AppDatabase, type Transaction } from "../src/lib/types.ts";

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

  // 7. Daily-average divisor uses real elapsed days per period
  assert.equal(countElapsedDays(txs, "month", now), 17);
  assert.equal(countElapsedDays(txs, "year", now), 321); // Jan 1 .. Nov 17, 2026
  assert.equal(countElapsedDays(txs, { kind: "month", monthKey: "2026-10" }, now), 31);
  assert.equal(countElapsedDays(txs, { kind: "month", monthKey: "2026-12" }, now), 1);
  assert.equal(
    countElapsedDays(txs, { kind: "custom", startDate: "2026-11-10", endDate: "2026-11-30" }, now),
    8,
  );
  assert.equal(computePeriodMetrics(txs, "year", now).dailyAverageExpense, Math.round(20_000 / 321));

  // 8. Goal progress derived from deposit transactions (edit/delete stays consistent)
  const goalDb = {
    goals: [{ id: "g1", name: "Laptop", targetAmount: 1_000_000, currentAmount: 999, createdAt: "" }],
    transactions: [
      { ...txs[1], id: "d1", amount: 100_000, goalId: "g1" },
      { ...txs[1], id: "d2", amount: 50_000, goalId: "g1" },
    ],
  } as unknown as AppDatabase;
  recomputeGoalAmounts(goalDb);
  assert.equal(goalDb.goals[0].currentAmount, 150_000);
  goalDb.transactions = goalDb.transactions.filter((t) => t.id !== "d2");
  recomputeGoalAmounts(goalDb);
  assert.equal(goalDb.goals[0].currentAmount, 100_000);

  // 9. Account initialBalance prevents negative balance from opening expenses
  const seededAccounts: Account[] = sampleAccounts.map((a) =>
    a.id === "acc-cash" ? { ...a, initialBalance: 1_500_000 } : a,
  );
  const seededBalances = computeAccountBalances(seededAccounts, txs);
  assert.equal(seededBalances.find((b) => b.id === "acc-cash")?.balance, 481_000);

  // 10. Category icon options are unique and cover every preset category iconKey
  const iconKeys = CATEGORY_ICON_OPTIONS.map((o) => o.key);
  assert.equal(new Set(iconKeys).size, iconKeys.length);
  for (const preset of Object.values(PRESET_CATEGORIES)) {
    for (const item of [...preset.keluar, ...preset.masuk]) {
      assert.ok(iconKeys.includes(item.iconKey as (typeof iconKeys)[number]), `Missing icon: ${item.iconKey}`);
    }
  }

  // 11. Category rename updates matching transactions; delete reassigns to chosen replacement
  const catDb = {
    categories: [
      { id: "c1", name: "Makanan", type: "Keluar", iconKey: "utensils" },
      { id: "c2", name: "Makanan dan Minuman", type: "Keluar", iconKey: "coffee" },
      { id: "c3", name: "Gaji", type: "Masuk", iconKey: "briefcase" },
    ],
    transactions: [
      { ...txs[1], id: "t-k", type: "Keluar", category: "Makanan" },
      { ...txs[0], id: "t-m", type: "Masuk", category: "Gaji" },
    ],
    sheetConnection: { configured: false, connected: false, sheetTabName: "Transaksi" },
  } as unknown as AppDatabase;

  const dupRes = updateCategoryInDb(catDb, "c1", { name: "makanan dan minuman" });
  assert.equal(dupRes.ok, false);

  const renRes = updateCategoryInDb(catDb, "c1", { name: "Konsumsi", iconKey: "coffee" });
  assert.equal(renRes.ok, true);
  assert.equal(catDb.categories[0].name, "Konsumsi");
  assert.equal(catDb.categories[0].iconKey, "coffee");
  assert.equal(catDb.transactions[0].category, "Konsumsi");

  const badDel = deleteCategoryInDb(catDb, "c1");
  assert.equal(badDel.ok, false);

  const okDel = deleteCategoryInDb(catDb, "c1", "Makanan dan Minuman");
  assert.equal(okDel.ok, true);
  assert.equal(catDb.categories.some((c) => c.id === "c1"), false);
  assert.equal(catDb.transactions[0].category, "Makanan dan Minuman");
  assert.equal(catDb.transactions[1].category, "Gaji");

  // 12. Reorder categories within a type preserves opposite-type categories and rejects bad IDs
  catDb.categories.push({ id: "c4", name: "Transportasi", type: "Keluar", iconKey: "bus" });
  const badReorder = reorderCategoriesInDb(catDb, "Keluar", ["c2"]);
  assert.equal(badReorder.ok, false);
  const okReorder = reorderCategoriesInDb(catDb, "Keluar", ["c4", "c2"]);
  assert.equal(okReorder.ok, true);
  assert.deepEqual(
    catDb.categories.filter((c) => c.type === "Keluar").map((c) => c.id),
    ["c4", "c2"],
  );
  assert.deepEqual(
    catDb.categories.filter((c) => c.type === "Masuk").map((c) => c.id),
    ["c3"],
  );

  console.log("ALL CORE TESTS PASSED (12/12)");
}

runTests();
