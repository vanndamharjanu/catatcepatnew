"use client";

import React, { useState } from "react";
import { formatCompactRupiah, formatRupiah } from "@/lib/finance";

export const EXPENSE_SEGMENT_COLORS = [
  "#6E1128",
  "#BE123C",
  "#B45309",
  "#1D4ED8",
  "#9D174D",
  "#475569",
];

export const INCOME_SEGMENT_COLORS = [
  "#047857",
  "#0F766E",
  "#1D4ED8",
  "#B45309",
  "#6E1128",
  "#475569",
];

interface CategoryBreakdownChartProps {
  title?: string;
  emptyText?: string;
  centerLabel?: string;
  data: Array<{ name: string; amount: number; pct: number }>;
  totalAmount: number;
  palette?: string[];
  hideNumbers?: boolean;
}

export function CategoryDonutChart({
  title = "Ke mana pengeluaran periode ini keluar?",
  emptyText = "Belum ada data pada periode ini. Grafik kategori akan muncul setelah transaksi dicatat.",
  centerLabel = "Total",
  data,
  totalAmount,
  palette = EXPENSE_SEGMENT_COLORS,
  hideNumbers = false,
}: CategoryBreakdownChartProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  if (data.length === 0 || totalAmount <= 0) {
    return (
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 text-center">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
        <p className="mt-2 text-xs text-[var(--text-muted)]">{emptyText}</p>
      </div>
    );
  }

  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let accumulatedPct = 0;

  const activeItem = activeIdx !== null ? data[activeIdx] : null;

  return (
    <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 sm:p-5">
      <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>

      <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row">
        <div className="relative flex h-40 w-40 shrink-0 items-center justify-center">
          <svg viewBox="0 0 144 144" className="h-40 w-40 -rotate-90" role="img" aria-label={title}>
            {data.map((item, idx) => {
              const fraction = item.amount / totalAmount;
              const strokeLen = fraction * circumference;
              const offset = -accumulatedPct * circumference;
              accumulatedPct += fraction;
              const color = palette[idx % palette.length];

              return (
                <circle
                  key={item.name}
                  cx="72"
                  cy="72"
                  r={radius}
                  fill="none"
                  stroke={color}
                  strokeWidth={activeIdx === idx ? 20 : 16}
                  strokeDasharray={`${Math.max(strokeLen - 2, 1)} ${circumference}`}
                  strokeDashoffset={offset}
                  className="cursor-pointer transition-all duration-150"
                  onMouseEnter={() => setActiveIdx(idx)}
                  onMouseLeave={() => setActiveIdx(null)}
                  onClick={() => setActiveIdx(activeIdx === idx ? null : idx)}
                />
              );
            })}
          </svg>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
            <span className="text-[11px] font-medium text-[var(--text-muted)] truncate max-w-[96px]">
              {activeItem ? activeItem.name : centerLabel}
            </span>
            <span className="mt-0.5 text-xs font-extrabold text-[var(--text-primary)] tabular-nums">
              {hideNumbers
                ? "Rp ***"
                : formatCompactRupiah(activeItem ? activeItem.amount : totalAmount)}
            </span>
          </div>
        </div>

        <ul className="w-full flex-1 space-y-2">
          {data.map((item, idx) => {
            const color = palette[idx % palette.length];
            const isSelected = activeIdx === idx;
            return (
              <li key={item.name}>
                <button
                  type="button"
                  onClick={() => setActiveIdx(isSelected ? null : idx)}
                  className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-colors ${
                    isSelected ? "bg-[var(--bg-soft)]" : "hover:bg-[var(--bg-soft)]/60"
                  }`}
                >
                  <span className="flex items-center gap-2 font-semibold text-[var(--text-primary)] min-w-0">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{item.name}</span>
                  </span>
                  <span className="ml-2 shrink-0 font-bold text-[var(--text-primary)] tabular-nums">
                    {hideNumbers ? "Rp ***" : formatRupiah(item.amount)}{" "}
                    <span className="font-normal text-[var(--text-muted)]">({item.pct}%)</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

interface MonthlyTrendChartProps {
  data: Array<{ label: string; income: number; expense: number }>;
  year: number;
  hideNumbers?: boolean;
}

export function MonthlyTrendChart({
  data,
  year,
  hideNumbers = false,
}: MonthlyTrendChartProps) {
  const [selectedMonthIdx, setSelectedMonthIdx] = useState<number | null>(null);
  const maxVal = Math.max(
    100_000,
    ...data.flatMap((d) => [d.income, d.expense]),
  );

  const hasAnyData = data.some((d) => d.income > 0 || d.expense > 0);

  if (!hasAnyData) {
    return (
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 text-center">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">
          Bagaimana arus masuk vs keluar sepanjang {year}?
        </h3>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Belum ada data transaksi untuk tahun {year}.
        </p>
      </div>
    );
  }

  const activeMonth = selectedMonthIdx !== null ? data[selectedMonthIdx] : null;

  return (
    <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">
          Bagaimana arus masuk vs keluar sepanjang {year}?
        </h3>
        <div className="flex items-center gap-3 text-[11px] font-semibold">
          <span className="flex items-center gap-1.5 text-[var(--income-text)]">
            <span className="h-2.5 w-2.5 rounded-xs bg-[#047857]" aria-hidden="true" />
            Masuk
          </span>
          <span className="flex items-center gap-1.5 text-[var(--brand-primary)] dark:text-[#fda4af]">
            <span className="h-2.5 w-2.5 rounded-xs bg-[#8B1835]" aria-hidden="true" />
            Keluar
          </span>
        </div>
      </div>

      {activeMonth && (
        <div className="mt-2 rounded-xl bg-[var(--bg-soft)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] tabular-nums">
          {activeMonth.label} {year}: Masuk{" "}
          <strong>{hideNumbers ? "Rp ***" : formatRupiah(activeMonth.income)}</strong>, Keluar{" "}
          <strong>{hideNumbers ? "Rp ***" : formatRupiah(activeMonth.expense)}</strong>
        </div>
      )}

      <div className="mt-4 grid grid-cols-12 items-end gap-1 sm:gap-2 h-40 pt-4">
        {data.map((m, idx) => {
          const incHeight = Math.round((m.income / maxVal) * 100);
          const expHeight = Math.round((m.expense / maxVal) * 100);
          const isSelected = selectedMonthIdx === idx;

          return (
            <button
              key={m.label}
              type="button"
              onClick={() => setSelectedMonthIdx(isSelected ? null : idx)}
              aria-label={`${m.label}: Masuk ${formatRupiah(m.income)}, Keluar ${formatRupiah(m.expense)}`}
              className={`flex h-full flex-col items-center justify-end gap-1 rounded-lg px-0.5 py-1 transition-colors ${
                isSelected ? "bg-[var(--bg-soft)]" : "hover:bg-[var(--bg-soft)]/50"
              }`}
            >
              <div className="flex w-full flex-1 items-end justify-center gap-0.5">
                <div
                  className="w-2 sm:w-2.5 rounded-t-sm bg-[#047857] transition-all duration-300"
                  style={{ height: `${m.income > 0 ? Math.max(6, incHeight) : 2}%`, opacity: m.income > 0 ? 1 : 0.2 }}
                />
                <div
                  className="w-2 sm:w-2.5 rounded-t-sm bg-[#8B1835] transition-all duration-300"
                  style={{ height: `${m.expense > 0 ? Math.max(6, expHeight) : 2}%`, opacity: m.expense > 0 ? 1 : 0.2 }}
                />
              </div>
              <span className="text-[10px] font-semibold text-[var(--text-muted)]">
                {m.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
