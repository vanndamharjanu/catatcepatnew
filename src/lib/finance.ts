import type { Account, Transaction } from "./types";

/** Format integer amount as Indonesian Rupiah without decimals. */
export function formatRupiah(amount: number): string {
  const abs = Math.round(Math.abs(amount));
  const prefix = amount < 0 ? "-Rp " : "Rp ";
  return prefix + abs.toLocaleString("id-ID");
}

/** Format compact Rupiah for chart axes and tight badges. */
export function formatCompactRupiah(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}Rp${(abs / 1_000_000_000).toFixed(1).replace(".0", "")}M`;
  if (abs >= 1_000_000) return `${sign}Rp${(abs / 1_000_000).toFixed(1).replace(".0", "")}jt`;
  if (abs >= 1_000) return `${sign}Rp${Math.round(abs / 1_000)}rb`;
  return `${sign}Rp${abs}`;
}

/** Return local calendar date formatted as YYYY-MM-DD. */
export function toIsoDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface DailyAllowanceResult {
  dailyAllowance: number;
  spentToday: number;
  remainingToday: number;
  projectedTomorrow: number;
  remainingBudget: number;
  spentInCycle: number;
  daysLeftInCycle: number;
  cycleStart: string;
  cycleEnd: string;
  budgetUtilizationPct: number;
}

/**
 * Compute dynamic daily safe-to-spend allowance ("Jatah Per Hari")
 * from monthly budget and remaining days until the next payday cycle.
 */
export function computeDailyAllowance(
  transactions: Transaction[],
  monthlyBudget: number,
  paydayDay: number,
  now: Date = new Date(),
): DailyAllowanceResult {
  const todayIso = toIsoDate(now);
  const currentDay = now.getDate();
  const year = now.getFullYear();
  const month = now.getMonth();

  // Determine active cycle window based on paydayDay (e.g., 25th to 24th next month, or calendar month if payday=1)
  const clampedPayday = Math.min(Math.max(paydayDay, 1), 28);
  let cycleStartDate: Date;
  let cycleEndDate: Date;

  if (clampedPayday === 1) {
    cycleStartDate = new Date(year, month, 1);
    cycleEndDate = new Date(year, month + 1, 0);
  } else if (currentDay >= clampedPayday) {
    cycleStartDate = new Date(year, month, clampedPayday);
    cycleEndDate = new Date(year, month + 1, clampedPayday - 1);
  } else {
    cycleStartDate = new Date(year, month - 1, clampedPayday);
    cycleEndDate = new Date(year, month, clampedPayday - 1);
  }

  const cycleStartIso = toIsoDate(cycleStartDate);
  const cycleEndIso = toIsoDate(cycleEndDate);

  const msPerDay = 86_400_000;
  const todayMidnight = new Date(year, month, currentDay).getTime();
  const endMidnight = new Date(
    cycleEndDate.getFullYear(),
    cycleEndDate.getMonth(),
    cycleEndDate.getDate(),
  ).getTime();
  const daysLeftInCycle = Math.max(1, Math.round((endMidnight - todayMidnight) / msPerDay) + 1);

  let spentInCycle = 0;
  let spentToday = 0;

  for (const tx of transactions) {
    if (tx.type !== "Keluar") continue;
    if (tx.date >= cycleStartIso && tx.date <= cycleEndIso) {
      spentInCycle += tx.amount;
    }
    if (tx.date === todayIso) {
      spentToday += tx.amount;
    }
  }

  const spentBeforeToday = Math.max(0, spentInCycle - spentToday);
  const remainingAtStartOfToday = Math.max(0, monthlyBudget - spentBeforeToday);
  const dailyAllowance = Math.round(remainingAtStartOfToday / daysLeftInCycle);
  const remainingToday = dailyAllowance - spentToday;
  const remainingBudget = monthlyBudget - spentInCycle;

  const projectedTomorrow =
    daysLeftInCycle > 1
      ? Math.max(0, Math.round((Math.max(0, remainingBudget)) / (daysLeftInCycle - 1)))
      : Math.max(0, remainingBudget);

  const budgetUtilizationPct =
    monthlyBudget > 0 ? Math.min(100, Math.round((spentInCycle / monthlyBudget) * 100)) : 0;

  return {
    dailyAllowance,
    spentToday,
    remainingToday,
    projectedTomorrow,
    remainingBudget,
    spentInCycle,
    daysLeftInCycle,
    cycleStart: cycleStartIso,
    cycleEnd: cycleEndIso,
    budgetUtilizationPct,
  };
}

export interface StreakInfo {
  streakDays: number;
  recordedToday: boolean;
  accessory: "none" | "glasses" | "headband" | "crown";
  accessoryLabel: string;
  nextMilestoneDays: number;
  daysToNextMilestone: number;
}

/** Calculate consecutive transaction logging streak ending today or yesterday. */
export function computeStreak(
  transactions: Transaction[],
  now: Date = new Date(),
): StreakInfo {
  const uniqueDates = new Set(transactions.map((t) => t.date));
  const todayIso = toIsoDate(now);
  const recordedToday = uniqueDates.has(todayIso);

  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!recordedToday) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streakDays = 0;
  while (uniqueDates.has(toIsoDate(cursor))) {
    streakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  let accessory: StreakInfo["accessory"] = "none";
  let accessoryLabel = "Polos";
  if (streakDays >= 14) {
    accessory = "crown";
    accessoryLabel = "Mahkota Emas";
  } else if (streakDays >= 7) {
    accessory = "headband";
    accessoryLabel = "Ikat Fokus";
  } else if (streakDays >= 3) {
    accessory = "glasses";
    accessoryLabel = "Kacamata Pintar";
  }

  const milestones = [3, 7, 14, 30];
  const nextMilestoneDays = milestones.find((m) => m > streakDays) ?? 30;
  const daysToNextMilestone = Math.max(0, nextMilestoneDays - streakDays);

  return {
    streakDays,
    recordedToday,
    accessory,
    accessoryLabel,
    nextMilestoneDays,
    daysToNextMilestone,
  };
}

/** Compute live balances per account considering income, expenses, and transfers. */
export function computeAccountBalances(
  accounts: Account[],
  transactions: Transaction[],
): Array<Account & { balance: number }> {
  const totals = new Map<string, number>();
  for (const acc of accounts) {
    totals.set(acc.id, acc.initialBalance);
  }

  for (const tx of transactions) {
    if (tx.type === "Masuk") {
      totals.set(tx.accountId, (totals.get(tx.accountId) ?? 0) + tx.amount);
    } else if (tx.type === "Keluar") {
      totals.set(tx.accountId, (totals.get(tx.accountId) ?? 0) - tx.amount);
    } else if (tx.type === "Transfer") {
      totals.set(tx.accountId, (totals.get(tx.accountId) ?? 0) - tx.amount);
      if (tx.toAccountId) {
        totals.set(tx.toAccountId, (totals.get(tx.toAccountId) ?? 0) + tx.amount);
      }
    } else if (tx.type === "Koreksi") {
      const signedDelta = tx.category === "Koreksi Kurang" ? -tx.amount : tx.amount;
      totals.set(tx.accountId, (totals.get(tx.accountId) ?? 0) + signedDelta);
    }
  }

  return accounts.map((acc) => ({
    ...acc,
    balance: totals.get(acc.id) ?? acc.initialBalance,
  }));
}

export type TimeRangeKey = "today" | "week" | "month" | "year" | "all";

export type PeriodFilter =
  | TimeRangeKey
  | { kind: "month"; monthKey: string }
  | { kind: "custom"; startDate: string; endDate: string };

export interface CategorySlice {
  name: string;
  amount: number;
  pct: number;
}

export interface PeriodSummary {
  income: number;
  expense: number;
  net: number;
  savingRate: number;
  prevExpense: number | null;
  expenseDeltaPct: number | null;
  topCategory: CategorySlice | null;
  dailyAverageExpense: number;
  expenseByCategory: CategorySlice[];
  incomeByCategory: CategorySlice[];
  monthlyTrend: Array<{ label: string; income: number; expense: number }>;
}

/** Filter transactions by named time range, specific YYYY-MM month, or inclusive custom dates. */
export function filterByPeriod(
  transactions: Transaction[],
  filter: PeriodFilter,
  now: Date = new Date(),
): Transaction[] {
  if (typeof filter !== "string") {
    if (filter.kind === "month") {
      return filter.monthKey === "all"
        ? transactions
        : transactions.filter((t) => t.date.startsWith(filter.monthKey));
    }
    const { startDate, endDate } = filter;
    return transactions.filter((t) => {
      if (startDate && t.date < startDate) return false;
      if (endDate && t.date > endDate) return false;
      return true;
    });
  }

  return filterByTimeRange(transactions, filter, now);
}

/** Filter transactions by range relative to now, ensuring year matches properly. */
export function filterByTimeRange(
  transactions: Transaction[],
  range: TimeRangeKey,
  now: Date = new Date(),
): Transaction[] {
  const todayIso = toIsoDate(now);
  const year = now.getFullYear();
  const monthPrefix = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const yearPrefix = `${year}-`;

  if (range === "all") return transactions;
  if (range === "today") return transactions.filter((t) => t.date === todayIso);
  if (range === "month") return transactions.filter((t) => t.date.startsWith(monthPrefix));
  if (range === "year") return transactions.filter((t) => t.date.startsWith(yearPrefix));

  // week: Monday through today
  const dayOfWeek = (now.getDay() + 6) % 7; // Mon=0..Sun=6
  const startOfWeek = new Date(year, now.getMonth(), now.getDate() - dayOfWeek);
  const startIso = toIsoDate(startOfWeek);
  return transactions.filter((t) => t.date >= startIso && t.date <= todayIso);
}

function summarizeByCategory(
  transactions: Transaction[],
  type: "Masuk" | "Keluar",
  totalAmount: number,
): CategorySlice[] {
  const map = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type !== type) continue;
    map.set(tx.category, (map.get(tx.category) ?? 0) + tx.amount);
  }
  return Array.from(map.entries())
    .map(([name, amount]) => ({
      name,
      amount,
      pct: totalAmount > 0 ? Math.round((amount / totalAmount) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Days elapsed in the period (start through min(end, today)), used as the daily-average divisor. */
export function countElapsedDays(
  scoped: Transaction[],
  filter: PeriodFilter,
  now: Date = new Date(),
): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const earliest = () =>
    scoped.length > 0
      ? parseIsoDate(scoped.reduce((min, t) => (t.date < min ? t.date : min), scoped[0].date))
      : today;

  let start: Date;
  let end: Date = today;

  if (filter === "today") {
    return 1;
  } else if (filter === "week") {
    start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((now.getDay() + 6) % 7));
  } else if (filter === "month") {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (filter === "year") {
    start = new Date(today.getFullYear(), 0, 1);
  } else if (filter === "all") {
    start = earliest();
  } else if (filter.kind === "month") {
    if (!/^\d{4}-\d{2}$/.test(filter.monthKey)) {
      start = earliest();
    } else {
      const [y, m] = filter.monthKey.split("-").map(Number);
      start = new Date(y, m - 1, 1);
      end = new Date(y, m, 0);
    }
  } else {
    start = filter.startDate ? parseIsoDate(filter.startDate) : earliest();
    if (filter.endDate) end = parseIsoDate(filter.endDate);
  }

  if (end > today) end = today;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

/** Compute period KPIs, income/expense category breakdowns, and 12-month trend. */
export function computePeriodMetrics(
  transactions: Transaction[],
  filter: PeriodFilter,
  now: Date = new Date(),
): PeriodSummary {
  const scoped = filterByPeriod(transactions, filter, now);
  let income = 0;
  let expense = 0;

  for (const tx of scoped) {
    if (tx.type === "Masuk") income += tx.amount;
    else if (tx.type === "Keluar") expense += tx.amount;
  }

  const expenseByCategory = summarizeByCategory(scoped, "Keluar", expense);
  const incomeByCategory = summarizeByCategory(scoped, "Masuk", income);
  const topCategory = expenseByCategory.length > 0 ? expenseByCategory[0] : null;
  const savingRate = income > 0 ? Math.round(((income - expense) / income) * 100) : 0;

  // Previous period comparison (only meaningful for active month)
  let prevExpense: number | null = null;
  let expenseDeltaPct: number | null = null;
  if (filter === "month") {
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevPrefix = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const prevRows = transactions.filter((t) => t.type === "Keluar" && t.date.startsWith(prevPrefix));
    if (prevRows.length > 0) {
      prevExpense = prevRows.reduce((sum, t) => sum + t.amount, 0);
      expenseDeltaPct = prevExpense > 0 ? Math.round(((expense - prevExpense) / prevExpense) * 100) : null;
    }
  }

  const dailyAverageExpense = Math.round(expense / countElapsedDays(scoped, filter, now));

  // 12-month trend for target year (derived from monthKey year when selected, else current year)
  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const trendYear =
    typeof filter !== "string" && filter.kind === "month" && /^\d{4}-\d{2}$/.test(filter.monthKey)
      ? filter.monthKey.slice(0, 4)
      : String(now.getFullYear());

  const monthlyTrend = monthLabels.map((label, idx) => {
    const prefix = `${trendYear}-${String(idx + 1).padStart(2, "0")}`;
    let mInc = 0;
    let mExp = 0;
    for (const tx of transactions) {
      if (!tx.date.startsWith(prefix)) continue;
      if (tx.type === "Masuk") mInc += tx.amount;
      if (tx.type === "Keluar") mExp += tx.amount;
    }
    return { label, income: mInc, expense: mExp };
  });

  return {
    income,
    expense,
    net: income - expense,
    savingRate,
    prevExpense,
    expenseDeltaPct,
    topCategory,
    dailyAverageExpense,
    expenseByCategory,
    incomeByCategory,
    monthlyTrend,
  };
}

/** Answer user natural-language queries strictly from actual ledger data. */
export function answerFinancialQuestion(
  rawQuery: string,
  transactions: Transaction[],
  accounts: Account[],
  monthlyBudget: number,
  paydayDay: number,
): string {
  const q = rawQuery.toLowerCase().trim();
  if (!q) {
    return "Tulis pertanyaan seputar transaksimu, misalnya: kategori paling boros, sisa jatah harian, atau saldo dompet.";
  }

  if (transactions.length === 0) {
    return "Belum ada data transaksi tercatat. Catat minimal satu transaksi dulu supaya Guri bisa menghitung angka aslinya.";
  }

  const monthSummary = computePeriodMetrics(transactions, "month");
  const allowance = computeDailyAllowance(transactions, monthlyBudget, paydayDay);
  const balances = computeAccountBalances(accounts, transactions);

  if (q.includes("boros") || q.includes("terbesar") || q.includes("kategori")) {
    if (!monthSummary.topCategory) {
      return "Bulan ini belum ada pengeluaran tercatat.";
    }
    const topTwo = monthSummary.expenseByCategory.slice(0, 2);
    const detail = topTwo
      .map((c) => `${c.name} (${formatRupiah(c.amount)}, ${c.pct}%)`)
      .join(" dan ");
    return `Pengeluaran terbesar bulan ini ada di ${detail}. Total pengeluaran bulan ini ${formatRupiah(monthSummary.expense)}.`;
  }

  if (q.includes("jatah") || q.includes("harian") || q.includes("aman") || q.includes("budget")) {
    return `Jatah amanmu hari ini ${formatRupiah(allowance.dailyAllowance)}, sudah terpakai ${formatRupiah(allowance.spentToday)}, jadi sisa hari ini ${formatRupiah(allowance.remainingToday)}. Sisa budget siklus ini ${formatRupiah(allowance.remainingBudget)} untuk ${allowance.daysLeftInCycle} hari ke depan.`;
  }

  if (q.includes("saldo") || q.includes("dompet") || q.includes("akun") || q.includes("bca") || q.includes("gopay") || q.includes("tunai")) {
    const list = balances.map((b) => `${b.name}: ${formatRupiah(b.balance)}`).join(", ");
    const total = balances.reduce((s, b) => s + b.balance, 0);
    return `Rincian saldo akun saat ini -> ${list}. Total semua akun: ${formatRupiah(total)}.`;
  }

  if (q.includes("masuk") || q.includes("gaji") || q.includes("tabung") || q.includes("hemat")) {
    const savingRate =
      monthSummary.income > 0
        ? Math.round(((monthSummary.income - monthSummary.expense) / monthSummary.income) * 100)
        : 0;
    return `Bulan ini pemasukan tercatat ${formatRupiah(monthSummary.income)} dan pengeluaran ${formatRupiah(monthSummary.expense)}. Selisih bersih ${formatRupiah(monthSummary.net)} (rasio simpanan ${savingRate}%).`;
  }

  return `Ringkasan bulan ini: Pemasukan ${formatRupiah(monthSummary.income)}, Pengeluaran ${formatRupiah(monthSummary.expense)}, Rata-rata keluar ${formatRupiah(monthSummary.dailyAverageExpense)}/hari, dan Sisa Jatah Hari Ini ${formatRupiah(allowance.remainingToday)}.`;
}
