"use client";

import React from "react";
import type {
  Account,
  CategoryItem,
  RecurringTemplate,
  SavingGoal,
} from "@/lib/types";

export interface GoalsTabProps {
  goals: SavingGoal[];
  accounts: Account[];
  categories: CategoryItem[];
  recurring: RecurringTemplate[];
  totalGoalsSaved: number;
  monthlyGoalDeposits: number;
  currentMonthPrefix: string;
  displayMoney: (amount: number) => string;
  setDepositModalGoalId: (id: string | null) => void;
  setGoalModalOpen: (open: boolean) => void;
  busyAction: boolean;
  handleDeleteGoal: (id: string) => void;
  recName: string;
  setRecName: (value: string) => void;
  recType: "Keluar" | "Masuk";
  setRecType: (value: "Keluar" | "Masuk") => void;
  recCategory: string;
  setRecCategory: (value: string) => void;
  recAccountId: string;
  setRecAccountId: (value: string) => void;
  recAmountRaw: string;
  setRecAmountRaw: (value: string) => void;
  recDay: string;
  setRecDay: (value: string) => void;
  handleAddRecurring: (e: React.FormEvent) => void;
  handleApplyRecurring: (item: RecurringTemplate) => Promise<void>;
  handleDeleteRecurring: (id: string) => void;
}

export function GoalsTab({
  goals,
  accounts,
  categories,
  recurring,
  totalGoalsSaved,
  monthlyGoalDeposits,
  currentMonthPrefix,
  displayMoney,
  setDepositModalGoalId,
  setGoalModalOpen,
  busyAction,
  handleDeleteGoal,
  recName,
  setRecName,
  recType,
  setRecType,
  recCategory,
  setRecCategory,
  recAccountId,
  setRecAccountId,
  recAmountRaw,
  setRecAmountRaw,
  recDay,
  setRecDay,
  handleAddRecurring,
  handleApplyRecurring,
  handleDeleteRecurring,
}: GoalsTabProps) {
  return (
    <div className="space-y-4">
      <section className="hero-maroon-gradient rounded-2xl p-5 text-white shadow-md">
        <p className="text-xs font-semibold text-[#F6D8DF]">
          Total tabungan terkumpul
        </p>
        <p className="mt-1 text-3xl font-extrabold tabular-nums">
          {displayMoney(totalGoalsSaved)}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-[rgba(255,255,255,0.12)] p-3">
            <span className="text-xs text-[#F6D8DF]">Target aktif</span>
            <span className="mt-0.5 block text-base font-extrabold tabular-nums">
              {goals.filter((g) => g.currentAmount < g.targetAmount).length}{" "}
              dari {goals.length}
            </span>
          </div>
          <div className="rounded-xl bg-[rgba(255,255,255,0.12)] p-3">
            <span className="text-xs text-[#F6D8DF]">Setoran bulan ini</span>
            <span className="mt-0.5 block text-base font-extrabold tabular-nums">
              {displayMoney(monthlyGoalDeposits)}
            </span>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          disabled={goals.length === 0}
          onClick={() => setDepositModalGoalId(goals[0]?.id || null)}
          className="min-h-[46px] flex-1 rounded-xl bg-[var(--brand-primary)] px-4 text-xs font-extrabold text-white hover:bg-[var(--brand-hover)] disabled:opacity-45"
        >
          Setor Tabungan
        </button>
        <button
          type="button"
          onClick={() => setGoalModalOpen(true)}
          className="min-h-[46px] flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 text-xs font-extrabold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
        >
          Target Baru
        </button>
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        Setoran tabungan otomatis tercatat di riwayat agar saldo dompet tetap
        akurat.
      </p>

      {goals.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-8 text-center">
          <h2 className="text-sm font-extrabold text-[var(--text-primary)]">
            Belum ada target tabungan
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--text-muted)]">
            Buat target terpisah, misalnya Dana Darurat atau Laptop Kerja, agar
            tabunganmu terpantau.
          </p>
          <button
            type="button"
            onClick={() => setGoalModalOpen(true)}
            className="mt-4 min-h-[44px] rounded-xl bg-[var(--brand-primary)] px-5 text-xs font-bold text-white hover:bg-[var(--brand-hover)]"
          >
            Buat Target Pertama
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {goals.map((goal) => {
            const pct = Math.min(
              100,
              Math.round((goal.currentAmount / goal.targetAmount) * 100),
            );
            return (
              <article
                key={goal.id}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
                      {goal.name}
                    </h3>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)] tabular-nums">
                      {displayMoney(goal.currentAmount)} dari{" "}
                      {displayMoney(goal.targetAmount)}
                    </p>
                  </div>
                  <span className="rounded-full bg-[var(--bg-soft)] px-2.5 py-0.5 text-xs font-extrabold text-[var(--brand-primary)] tabular-nums dark:text-[#fda4af]">
                    {pct}%
                  </span>
                </div>

                <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-soft)]">
                  <div
                    className="h-full rounded-full bg-[var(--brand-primary)] transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setDepositModalGoalId(goal.id)}
                    className="min-h-[38px] rounded-xl bg-[var(--bg-soft)] px-3 text-xs font-bold text-[var(--brand-primary)] dark:text-[#fda4af]"
                  >
                    Setor ke Target
                  </button>
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => handleDeleteGoal(goal.id)}
                    className="min-h-[38px] rounded-xl px-2.5 text-xs font-bold text-[var(--expense-text)] hover:bg-[var(--expense-bg)] disabled:opacity-50"
                  >
                    Hapus
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Recurring Monthly Templates */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 sm:p-5">
        <div className="mb-3">
          <h2 className="text-sm font-extrabold text-[var(--text-primary)]">
            Jadwal Transaksi Rutin Bulanan
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Simpan gaji, kos, WiFi, atau cicilan tetap agar bisa dicatat 1 klik
            tiap bulan.
          </p>
        </div>

        <form
          onSubmit={handleAddRecurring}
          className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:items-end"
        >
          <div>
            <label
              htmlFor="rec-name"
              className="mb-1 block text-[11px] font-bold text-[var(--text-muted)]"
            >
              Nama Jadwal
            </label>
            <input
              id="rec-name"
              type="text"
              value={recName}
              onChange={(e) => setRecName(e.target.value)}
              placeholder="Mis. WiFi / Gaji"
              className="min-h-[40px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)]"
            />
          </div>

          <div>
            <label
              htmlFor="rec-type"
              className="mb-1 block text-[11px] font-bold text-[var(--text-muted)]"
            >
              Jenis
            </label>
            <select
              id="rec-type"
              value={recType}
              onChange={(e) => {
                const nextT = e.target.value === "Masuk" ? "Masuk" : "Keluar";
                setRecType(nextT);
                const first = categories.find((c) => c.type === nextT);
                if (first) setRecCategory(first.name);
              }}
              className="min-h-[40px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)]"
            >
              <option value="Keluar">Keluar</option>
              <option value="Masuk">Masuk</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="rec-category"
              className="mb-1 block text-[11px] font-bold text-[var(--text-muted)]"
            >
              Kategori
            </label>
            <select
              id="rec-category"
              value={recCategory}
              onChange={(e) => setRecCategory(e.target.value)}
              className="min-h-[40px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)]"
            >
              {categories
                .filter((c) => c.type === recType)
                .map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="rec-account"
              className="mb-1 block text-[11px] font-bold text-[var(--text-muted)]"
            >
              Dompet
            </label>
            <select
              id="rec-account"
              value={recAccountId}
              onChange={(e) => setRecAccountId(e.target.value)}
              className="min-h-[40px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)]"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="rec-amount"
              className="mb-1 block text-[11px] font-bold text-[var(--text-muted)]"
            >
              Nominal (Rp)
            </label>
            <input
              id="rec-amount"
              type="text"
              inputMode="numeric"
              value={
                recAmountRaw
                  ? (
                      parseInt(recAmountRaw.replace(/\D/g, ""), 10) || 0
                    ).toLocaleString("id-ID")
                  : ""
              }
              onChange={(e) =>
                setRecAmountRaw(e.target.value.replace(/\D/g, ""))
              }
              placeholder="0"
              className="min-h-[40px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)] tabular-nums"
            />
          </div>

          <div className="flex items-end gap-2">
            <div className="w-24 shrink-0">
              <label
                htmlFor="rec-day"
                className="mb-1 block text-[11px] font-bold text-[var(--text-muted)]"
              >
                Tanggal (1-31)
              </label>
              <input
                id="rec-day"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                value={recDay}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "");
                  if (!raw) {
                    setRecDay("");
                    return;
                  }
                  const num = parseInt(raw, 10);
                  if (num >= 1 && num <= 31) {
                    setRecDay(String(num));
                  }
                }}
                className="min-h-[40px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 text-center text-xs font-bold text-[var(--text-primary)] tabular-nums"
              />
            </div>
            <button
              type="submit"
              className="min-h-[40px] flex-1 rounded-xl bg-[var(--brand-primary)] px-3 text-xs font-extrabold text-white hover:bg-[var(--brand-hover)]"
            >
              Tambah
            </button>
          </div>
        </form>

        {recurring.length > 0 && (
          <div className="mt-3 space-y-2">
            {recurring.map((item) => {
              const doneThisMonth =
                item.lastRecordedMonth === currentMonthPrefix;
              return (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-extrabold text-[var(--text-primary)]">
                      {item.name}{" "}
                      <span className="font-semibold text-[var(--text-muted)]">
                        · Tgl {item.dayOfMonth} · {item.category}
                      </span>
                    </p>
                    <p
                      className={`mt-0.5 font-bold tabular-nums ${
                        item.type === "Masuk"
                          ? "text-[var(--income-text)]"
                          : "text-[var(--expense-text)]"
                      }`}
                    >
                      {item.type === "Masuk" ? "+" : "-"}
                      {displayMoney(item.amount)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleApplyRecurring(item)}
                      className={`min-h-[34px] rounded-lg px-3 text-xs font-bold ${
                        doneThisMonth
                          ? "border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)]"
                          : "bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)]"
                      }`}
                    >
                      {doneThisMonth ? "Tercatat" : "Catat Sekarang"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRecurring(item.id)}
                      className="min-h-[34px] rounded-lg px-2 text-xs font-bold text-[var(--expense-text)] hover:bg-[var(--expense-bg)]"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
