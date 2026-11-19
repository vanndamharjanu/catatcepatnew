"use client";

import React, { useEffect, useState } from "react";
import {
  computeAccountBalances,
  formatDisplayDate,
} from "@/lib/finance";
import type {
  Account,
  CategoryItem,
  Transaction,
  TransactionType,
} from "@/lib/types";
import { CategoryIcon, ScaleIcon } from "../Icons";

const PAGE_STEP = 50;

export interface HistoryTabProps {
  accounts: Account[];
  categories: CategoryItem[];
  totalTransactionsCount: number;
  filteredTransactions: Transaction[];
  filteredNet: number;
  accountBalances: ReturnType<typeof computeAccountBalances>;
  availableMonths: string[];
  formatMonthLabel: (ym: string) => string;
  filterMonth: string;
  setFilterMonth: (value: string) => void;
  filterType: "all" | TransactionType;
  setFilterType: (value: "all" | TransactionType) => void;
  filterAccount: string;
  setFilterAccount: (value: string) => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  riwayatStartDate: string;
  setRiwayatStartDate: (value: string) => void;
  riwayatEndDate: string;
  setRiwayatEndDate: (value: string) => void;
  displayMoney: (amount: number) => string;
  openReconcile: (accountId?: string) => void;
  handleExportCsv: () => void;
  onEditTx: (tx: Transaction) => void;
  confirmDeleteTxId: string | null;
  setConfirmDeleteTxId: (id: string | null) => void;
  busyAction: boolean;
  handleDeleteTx: (id: string) => void;
  hasMoreTransactions: boolean;
  loadingMoreTx: boolean;
  isDemoMode: boolean;
  onLoadMoreTransactions: () => void;
}

export function HistoryTab({
  accounts,
  categories,
  totalTransactionsCount,
  filteredTransactions,
  filteredNet,
  accountBalances,
  availableMonths,
  formatMonthLabel,
  filterMonth,
  setFilterMonth,
  filterType,
  setFilterType,
  filterAccount,
  setFilterAccount,
  searchQuery,
  setSearchQuery,
  riwayatStartDate,
  setRiwayatStartDate,
  riwayatEndDate,
  setRiwayatEndDate,
  displayMoney,
  openReconcile,
  handleExportCsv,
  onEditTx,
  confirmDeleteTxId,
  setConfirmDeleteTxId,
  busyAction,
  handleDeleteTx,
  hasMoreTransactions,
  loadingMoreTx,
  isDemoMode,
  onLoadMoreTransactions,
}: HistoryTabProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_STEP);

  useEffect(() => {
    setVisibleCount(PAGE_STEP);
  }, [
    filterMonth,
    filterType,
    filterAccount,
    searchQuery,
    riwayatStartDate,
    riwayatEndDate,
  ]);

  const visibleTransactions = filteredTransactions.slice(0, visibleCount);
  const remainingLocal = filteredTransactions.length - visibleTransactions.length;

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label
              htmlFor="filter-month"
              className="mb-1 block text-[11px] font-bold text-[var(--text-muted)]"
            >
              Bulan & Tahun
            </label>
            <select
              id="filter-month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)]"
            >
              <option value="all">Semua Periode</option>
              <option value="custom">Pilih Tanggal (Custom)</option>
              {availableMonths.map((ym) => (
                <option key={ym} value={ym}>
                  {formatMonthLabel(ym)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="filter-type"
              className="mb-1 block text-[11px] font-bold text-[var(--text-muted)]"
            >
              Jenis
            </label>
            <select
              id="filter-type"
              value={filterType}
              onChange={(e) =>
                setFilterType(e.target.value as "all" | TransactionType)
              }
              className="min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)]"
            >
              <option value="all">Semua Jenis</option>
              <option value="Keluar">Pengeluaran</option>
              <option value="Masuk">Pemasukan</option>
              <option value="Transfer">Transfer Akun</option>
              <option value="Koreksi">Koreksi Saldo</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="filter-account"
              className="mb-1 block text-[11px] font-bold text-[var(--text-muted)]"
            >
              Akun
            </label>
            <select
              id="filter-account"
              value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value)}
              className="min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)]"
            >
              <option value="all">Semua Akun</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="search-tx"
              className="mb-1 block text-[11px] font-bold text-[var(--text-muted)]"
            >
              Cari
            </label>
            <input
              id="search-tx"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Kategori / catatan..."
              className="min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs text-[var(--text-primary)]"
            />
          </div>
        </div>

        {filterMonth === "custom" && (
          <div className="mt-3 grid gap-2.5 border-t border-[var(--border-subtle)] pt-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="riwayat-start"
                className="mb-1 block text-[11px] font-bold text-[var(--text-muted)]"
              >
                Mulai Tanggal
              </label>
              <input
                id="riwayat-start"
                type="date"
                value={riwayatStartDate}
                onChange={(e) => setRiwayatStartDate(e.target.value)}
                className="min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label
                htmlFor="riwayat-end"
                className="mb-1 block text-[11px] font-bold text-[var(--text-muted)]"
              >
                Sampai Tanggal
              </label>
              <input
                id="riwayat-end"
                type="date"
                value={riwayatEndDate}
                onChange={(e) => setRiwayatEndDate(e.target.value)}
                className="min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)]"
              />
            </div>
          </div>
        )}

        <div className="no-print mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3">
          <div className="text-xs font-bold text-[var(--text-primary)] tabular-nums">
            Selisih filter ({filteredTransactions.length} item):{" "}
            <span
              className={
                filteredNet >= 0
                  ? "text-[var(--income-text)]"
                  : "text-[var(--expense-text)]"
              }
            >
              {displayMoney(filteredNet)}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {(totalTransactionsCount > 0 ||
              accountBalances.some((a) => a.balance !== 0)) && (
              <button
                type="button"
                onClick={() => openReconcile()}
                className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
              >
                <ScaleIcon className="h-3.5 w-3.5" />
                Koreksi Saldo
              </button>
            )}
            <button
              type="button"
              onClick={handleExportCsv}
              className="min-h-[38px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
            >
              Unduh Data
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[38px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
            >
              Cetak
            </button>
          </div>
        </div>
      </section>

      {/* Empty state vs List */}
      {filteredTransactions.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-8 text-center">
          <p className="text-sm font-bold text-[var(--text-primary)]">
            {totalTransactionsCount === 0
              ? "Belum ada transaksi tersimpan"
              : "Tidak ada transaksi yang cocok dengan filter ini"}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {totalTransactionsCount === 0
              ? "Gunakan tombol + Catat Transaksi untuk mulai mencatat."
              : "Coba ubah periode, akun, atau kata kunci."}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibleTransactions.map((tx) => {
            const accName =
              accounts.find((a) => a.id === tx.accountId)?.name || tx.accountId;
            const toAccName = tx.toAccountId
              ? accounts.find((a) => a.id === tx.toAccountId)?.name
              : null;
            const catIconKey =
              categories.find(
                (c) => c.name === tx.category && c.type === tx.type,
              )?.iconKey || (tx.type === "Transfer" ? "wallet" : "tag");

            return (
              <article
                key={tx.id}
                className="flex flex-col justify-between gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      tx.type === "Masuk"
                        ? "bg-[var(--income-bg)] text-[var(--income-text)]"
                        : tx.type === "Keluar"
                          ? "bg-[var(--expense-bg)] text-[var(--expense-text)]"
                          : "bg-[var(--bg-soft)] text-[var(--brand-primary)] dark:text-[#fda4af]"
                    }`}
                  >
                    <CategoryIcon iconKey={catIconKey} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                          tx.type === "Masuk"
                            ? "bg-[var(--income-bg)] text-[var(--income-text)]"
                            : tx.type === "Keluar"
                              ? "bg-[var(--expense-bg)] text-[var(--expense-text)]"
                              : "bg-[var(--bg-soft)] text-[var(--text-primary)]"
                        }`}
                      >
                        {tx.type}
                      </span>
                      <span className="text-sm font-extrabold text-[var(--text-primary)]">
                        {tx.category}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">
                        {toAccName ? `${accName} -> ${toAccName}` : accName}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
                      {formatDisplayDate(tx.date)}{" "}
                      {tx.note ? `· ${tx.note}` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <span
                    className={`text-sm font-extrabold tabular-nums ${
                      tx.type === "Masuk" ||
                      (tx.type === "Koreksi" &&
                        tx.category === "Koreksi Tambah")
                        ? "text-[var(--income-text)]"
                        : tx.type === "Keluar" ||
                            (tx.type === "Koreksi" &&
                              tx.category === "Koreksi Kurang")
                          ? "text-[var(--expense-text)]"
                          : "text-[var(--text-primary)]"
                    }`}
                  >
                    {tx.type === "Masuk" ||
                    (tx.type === "Koreksi" && tx.category === "Koreksi Tambah")
                      ? "+"
                      : tx.type === "Keluar" ||
                          (tx.type === "Koreksi" &&
                            tx.category === "Koreksi Kurang")
                        ? "-"
                        : ""}
                    {displayMoney(tx.amount)}
                  </span>

                  <div className="no-print flex items-center gap-1.5">
                    {tx.type !== "Koreksi" && (
                      <button
                        type="button"
                        onClick={() => onEditTx(tx)}
                        className="min-h-[36px] rounded-lg border border-[var(--border-subtle)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
                      >
                        Edit
                      </button>
                    )}
                    {confirmDeleteTxId === tx.id ? (
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => handleDeleteTx(tx.id)}
                        className="min-h-[36px] rounded-lg bg-[#BE123C] px-2.5 text-xs font-bold text-white"
                      >
                        Konfirmasi
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteTxId(tx.id)}
                        className="min-h-[36px] rounded-lg border border-[var(--border-subtle)] px-2.5 text-xs font-bold text-[var(--expense-text)] hover:bg-[var(--expense-bg)]"
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}

          {remainingLocal > 0 && (
            <div className="no-print flex justify-center pt-1">
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + PAGE_STEP)}
                className="min-h-[42px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
              >
                Tampilkan lebih banyak ({remainingLocal} tersisa)
              </button>
            </div>
          )}

          {hasMoreTransactions && !isDemoMode && (
            <div className="no-print flex justify-center pt-1">
              <button
                type="button"
                disabled={loadingMoreTx}
                onClick={onLoadMoreTransactions}
                className="min-h-[42px] rounded-xl bg-[var(--bg-soft)] px-4 text-xs font-extrabold text-[var(--brand-primary)] hover:opacity-90 disabled:opacity-50 dark:text-[#fda4af]"
              >
                {loadingMoreTx
                  ? "Memuat arsip transaksi..."
                  : "Muat Arsip Transaksi Lebih Lama"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
