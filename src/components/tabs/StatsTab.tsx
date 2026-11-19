"use client";

import React from "react";
import type { DailyAllowanceResult, PeriodSummary } from "@/lib/finance";
import type { CategoryItem } from "@/lib/types";
import {
  CategoryDonutChart,
  EXPENSE_SEGMENT_COLORS,
  INCOME_SEGMENT_COLORS,
  MonthlyTrendChart,
} from "../Charts";
import { OctopusMascot } from "../OctopusMascot";

export interface StatsTabProps {
  categories: CategoryItem[];
  monthlyBudget: number;
  categoryBudgets: Record<string, number>;
  availableMonths: string[];
  formatMonthLabel: (ym: string) => string;
  statFilterMode: string;
  setStatFilterMode: (value: string) => void;
  statStartDate: string;
  setStatStartDate: (value: string) => void;
  statEndDate: string;
  setStatEndDate: (value: string) => void;
  statMetrics: PeriodSummary;
  statTrendYear: number;
  allowance: DailyAllowanceResult;
  hideNumbers: boolean;
  displayMoney: (amount: number) => string;
  onOpenBudgetSettings: () => void;
  budgetCatName: string;
  setBudgetCatName: (value: string) => void;
  budgetCatCapRaw: string;
  setBudgetCatCapRaw: (value: string) => void;
  handleSaveCategoryBudget: (e: React.FormEvent) => void;
  handleDeleteCategoryBudget: (catName: string) => void;
  askInput: string;
  setAskInput: (value: string) => void;
  askAnswer: string | null;
  askLoading: boolean;
  handleAskGuri: (question: string) => Promise<void>;
}

export function StatsTab({
  categories,
  monthlyBudget,
  categoryBudgets,
  availableMonths,
  formatMonthLabel,
  statFilterMode,
  setStatFilterMode,
  statStartDate,
  setStatStartDate,
  statEndDate,
  setStatEndDate,
  statMetrics,
  statTrendYear,
  allowance,
  hideNumbers,
  displayMoney,
  onOpenBudgetSettings,
  budgetCatName,
  setBudgetCatName,
  budgetCatCapRaw,
  setBudgetCatCapRaw,
  handleSaveCategoryBudget,
  handleDeleteCategoryBudget,
  askInput,
  setAskInput,
  askAnswer,
  askLoading,
  handleAskGuri,
}: StatsTabProps) {
  return (
    <div className="space-y-4">
      {/* Dedicated Period & Custom Date Range Filter for Statistik */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="sm:w-64">
            <label
              htmlFor="stat-period"
              className="mb-1 block text-[11px] font-bold text-[var(--text-muted)]"
            >
              Filter Periode Statistik
            </label>
            <select
              id="stat-period"
              value={statFilterMode}
              onChange={(e) => setStatFilterMode(e.target.value)}
              className="min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)]"
            >
              <option value="all">Semua Data</option>
              <option value="custom">Pilih Tanggal (Custom)</option>
              {availableMonths.map((ym) => (
                <option key={ym} value={ym}>
                  {formatMonthLabel(ym)}
                </option>
              ))}
            </select>
          </div>

          {statFilterMode === "custom" && (
            <div className="grid flex-1 gap-2.5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="stat-start"
                  className="mb-1 block text-[11px] font-bold text-[var(--text-muted)]"
                >
                  Mulai
                </label>
                <input
                  id="stat-start"
                  type="date"
                  value={statStartDate}
                  onChange={(e) => setStatStartDate(e.target.value)}
                  className="min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label
                  htmlFor="stat-end"
                  className="mb-1 block text-[11px] font-bold text-[var(--text-muted)]"
                >
                  Sampai
                </label>
                <input
                  id="stat-end"
                  type="date"
                  value={statEndDate}
                  onChange={(e) => setStatEndDate(e.target.value)}
                  className="min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)]"
                />
              </div>
            </div>
          )}
        </div>

        {/* 3 Classic Summary KPIs + Saving Rate */}
        <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
          <div className="rounded-xl bg-[var(--income-bg)] px-3.5 py-2.5">
            <span className="text-[11px] font-bold text-[var(--income-text)]">
              Pemasukan
            </span>
            <p className="mt-0.5 text-base font-extrabold text-[var(--income-text)] tabular-nums">
              {displayMoney(statMetrics.income)}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--expense-bg)] px-3.5 py-2.5">
            <span className="text-[11px] font-bold text-[var(--expense-text)]">
              Pengeluaran
            </span>
            <p className="mt-0.5 text-base font-extrabold text-[var(--expense-text)] tabular-nums">
              {displayMoney(statMetrics.expense)}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--bg-soft)] px-3.5 py-2.5">
            <span className="text-[11px] font-bold text-[var(--text-muted)]">
              Selisih (Rasio Simpan {statMetrics.savingRate}%)
            </span>
            <p className="mt-0.5 text-base font-extrabold text-[var(--text-primary)] tabular-nums">
              {displayMoney(statMetrics.net)}
            </p>
          </div>
        </div>
      </section>

      {/* Monthly Budget Target Bar */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-extrabold text-[var(--text-primary)]">
              Batas Anggaran Siklus Aktif
            </h2>
            <p className="text-xs text-[var(--text-muted)] tabular-nums">
              Target: {displayMoney(monthlyBudget)} (
              {allowance.budgetUtilizationPct}% terpakai)
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenBudgetSettings}
            className="min-h-[38px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
          >
            Ubah Target
          </button>
        </div>

        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-[var(--bg-soft)]">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              allowance.budgetUtilizationPct > 90
                ? "bg-[#BE123C]"
                : allowance.budgetUtilizationPct > 70
                  ? "bg-[#D97706]"
                  : "bg-[#047857]"
            }`}
            style={{ width: `${allowance.budgetUtilizationPct}%` }}
          />
        </div>

        <div className="mt-2 flex justify-between text-xs font-semibold text-[var(--text-muted)] tabular-nums">
          <span>Terpakai: {displayMoney(allowance.spentInCycle)}</span>
          <span>Sisa: {displayMoney(allowance.remainingBudget)}</span>
        </div>
      </section>

      {/* Per-Category Budget Caps */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 sm:p-5">
        <div className="mb-3">
          <h2 className="text-sm font-extrabold text-[var(--text-primary)]">
            Batas Anggaran per Kategori
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Pasang plafon khusus untuk kategori rawan boros (mis. Makan &amp;
            Minum atau Belanja).
          </p>
        </div>

        <form
          onSubmit={handleSaveCategoryBudget}
          className="flex flex-wrap gap-2"
        >
          <select
            value={budgetCatName}
            onChange={(e) => setBudgetCatName(e.target.value)}
            aria-label="Pilih kategori batas anggaran"
            className="min-h-[40px] flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)]"
          >
            {categories
              .filter((c) => c.type === "Keluar")
              .map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
          </select>
          <input
            type="text"
            inputMode="numeric"
            value={
              budgetCatCapRaw
                ? (
                    parseInt(budgetCatCapRaw.replace(/\D/g, ""), 10) || 0
                  ).toLocaleString("id-ID")
                : ""
            }
            onChange={(e) =>
              setBudgetCatCapRaw(e.target.value.replace(/\D/g, ""))
            }
            placeholder="Batas / periode (Rp)"
            className="min-h-[40px] w-44 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)] tabular-nums"
          />
          <button
            type="submit"
            className="min-h-[40px] rounded-xl bg-[var(--brand-primary)] px-4 text-xs font-extrabold text-white hover:bg-[var(--brand-hover)]"
          >
            Pasang Batas
          </button>
        </form>

        {Object.keys(categoryBudgets).length > 0 && (
          <div className="mt-3.5 space-y-2.5">
            {Object.entries(categoryBudgets).map(([catName, cap]) => {
              const spent =
                statMetrics.expenseByCategory.find((s) => s.name === catName)
                  ?.amount ?? 0;
              const pct =
                cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : 0;
              const over = spent > cap;
              return (
                <div
                  key={catName}
                  className="rounded-xl bg-[var(--bg-canvas)] p-3"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-extrabold text-[var(--text-primary)]">
                      {catName}
                    </span>
                    <div className="flex items-center gap-2 tabular-nums">
                      <span
                        className={
                          over
                            ? "font-extrabold text-[var(--expense-text)]"
                            : "font-bold text-[var(--text-muted)]"
                        }
                      >
                        {displayMoney(spent)} / {displayMoney(cap)} ({pct}%)
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategoryBudget(catName)}
                        className="text-[11px] font-bold text-[var(--expense-text)] hover:underline"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--bg-soft)]">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        over || pct > 90
                          ? "bg-[#BE123C]"
                          : pct > 70
                            ? "bg-[#D97706]"
                            : "bg-[#047857]"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Dual Category Donut Charts: Income + Expense */}
      <div className="grid gap-4 lg:grid-cols-2">
        <CategoryDonutChart
          title="Dari mana sumber pemasukan periode ini?"
          emptyText="Belum ada pemasukan pada periode ini. Grafik pemasukan akan muncul setelah transaksi masuk dicatat."
          centerLabel="Total Masuk"
          data={statMetrics.incomeByCategory}
          totalAmount={statMetrics.income}
          palette={INCOME_SEGMENT_COLORS}
          hideNumbers={hideNumbers}
        />
        <CategoryDonutChart
          title="Ke mana pengeluaran periode ini keluar?"
          emptyText="Belum ada pengeluaran pada periode ini. Grafik pengeluaran akan muncul setelah transaksi keluar dicatat."
          centerLabel="Total Keluar"
          data={statMetrics.expenseByCategory}
          totalAmount={statMetrics.expense}
          palette={EXPENSE_SEGMENT_COLORS}
          hideNumbers={hideNumbers}
        />
      </div>

      <MonthlyTrendChart
        data={statMetrics.monthlyTrend}
        year={statTrendYear}
        hideNumbers={hideNumbers}
      />

      {/* Tanya Guri (Data-Driven Q&A) */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <OctopusMascot mood="ai" size={50} className="shrink-0" />
          <div>
            <h2 className="text-sm font-extrabold text-[var(--text-primary)]">
              Tanya Guri Tentang Datamu
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Dihitung langsung dari riwayat transaksimu.
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {[
            "Kategori paling boros bulan ini?",
            "Berapa sisa jatah hari ini?",
            "Berapa saldo per akun?",
          ].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void handleAskGuri(q)}
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
            >
              {q}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleAskGuri(askInput);
          }}
          className="mt-3 space-y-1.5"
        >
          <label
            htmlFor="ask-guri-input"
            className="block text-xs font-bold text-[var(--text-muted)]"
          >
            Pertanyaan untuk Guri
          </label>
          <div className="flex gap-2">
            <input
              id="ask-guri-input"
              type="text"
              value={askInput}
              onChange={(e) => setAskInput(e.target.value)}
              placeholder="Tulis pertanyaan keuanganmu..."
              className="min-h-[44px] flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 text-xs text-[var(--text-primary)]"
            />
            <button
              type="submit"
              disabled={askLoading}
              className="min-h-[44px] rounded-xl bg-[var(--brand-primary)] px-4 text-xs font-bold text-white hover:bg-[var(--brand-hover)]"
            >
              {askLoading ? "Menghitung..." : "Tanya"}
            </button>
          </div>
        </form>

        {askAnswer && (
          <div className="mt-3 rounded-2xl bg-[var(--bg-soft)] p-3.5 text-xs font-medium leading-relaxed text-[var(--text-primary)]">
            {askAnswer}
          </div>
        )}
      </section>
    </div>
  );
}
