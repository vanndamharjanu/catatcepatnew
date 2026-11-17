"use client";

import React, { useEffect, useRef, useState } from "react";
import { formatRupiah, type DailyAllowanceResult, type StreakInfo } from "@/lib/finance";
import type { Account } from "@/lib/types";
import {
  ArrowInIcon,
  ArrowOutIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  EyeIcon,
  PlusIcon,
  ScaleIcon,
} from "./Icons";
import { OctopusMascot, type GuriMood } from "./OctopusMascot";

type AccountWithBalance = Account & { balance: number };

const CARD_THEMES: Record<Account["kind"], { bg: string; label: string; tint: string }> = {
  cash: {
    bg: "linear-gradient(135deg, #5E1B28 0%, #380D16 100%)",
    label: "Uang Tunai",
    tint: "#F6D8DF",
  },
  bank: {
    bg: "linear-gradient(135deg, #1B365D 0%, #0F203B 100%)",
    label: "Rekening Bank",
    tint: "#DCE8F7",
  },
  ewallet: {
    bg: "linear-gradient(135deg, #581C4F 0%, #330D2E 100%)",
    label: "Dompet Digital",
    tint: "#F5D9F0",
  },
};

interface AccountCarouselProps {
  accounts: AccountWithBalance[];
  periodIncome: number;
  periodExpense: number;
  allowance: DailyAllowanceResult;
  streak: StreakInfo;
  guriMood: GuriMood;
  hideNumbers: boolean;
  onToggleHideNumbers: () => void;
  onOpenFormula: () => void;
  onQuickCatatAccount: (accountId: string) => void;
  onOpenReconcile: (accountId: string) => void;
}

/**
 * Swipeable hero account cards: Slide 0 shows total balance & daily allowance,
 * subsequent slides show each account card with balance share and reconciliation trigger.
 */
export function AccountCarousel({
  accounts,
  periodIncome,
  periodExpense,
  allowance,
  streak,
  guriMood,
  hideNumbers,
  onToggleHideNumbers,
  onOpenFormula,
  onQuickCatatAccount,
  onOpenReconcile,
}: AccountCarouselProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [peekTotal, setPeekTotal] = useState(false);
  const [peekAccountId, setPeekAccountId] = useState<string | null>(null);

  const totalSlides = 1 + accounts.length;
  const totalAssets = accounts.reduce((sum, acc) => sum + acc.balance, 0);
  const positivePool = accounts.reduce((sum, acc) => sum + Math.max(0, acc.balance), 0);

  const totalFlow = periodIncome + periodExpense;
  const incomePct = totalFlow > 0 ? Math.round((periodIncome / totalFlow) * 100) : 50;
  const expensePct = totalFlow > 0 ? 100 - incomePct : 50;

  useEffect(() => {
    if (!hideNumbers) {
      setPeekTotal(false);
      setPeekAccountId(null);
    }
  }, [hideNumbers]);

  const scrollToSlide = (idx: number) => {
    const el = trackRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(totalSlides - 1, idx));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
    setActiveSlide(clamped);
  };

  const handleTrackScroll = () => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== activeSlide) setActiveSlide(idx);
  };

  const formatMasked = (val: number, revealed: boolean) =>
    !hideNumbers || revealed ? formatRupiah(val) : "Rp ••••••";

  return (
    <section aria-label="Kartu saldo dan rekening">
      <div className="relative w-full overflow-hidden rounded-3xl shadow-md">
        <div
          ref={trackRef}
          onScroll={handleTrackScroll}
          className="no-scrollbar flex w-full snap-x snap-mandatory overflow-x-auto scroll-smooth"
        >
          {/* Slide 0: Total Saldo + Arus Kas + Jatah Harian */}
          <div className="hero-maroon-gradient w-full shrink-0 snap-center p-5 text-white sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-[#F6D8DF]">
                    Total Saldo Semua Akun
                  </p>
                  <button
                    type="button"
                    onClick={onToggleHideNumbers}
                    aria-label={hideNumbers ? "Tampilkan semua nominal" : "Sembunyikan semua nominal"}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
                  >
                    <EyeIcon off={hideNumbers} className="h-3.5 w-3.5" />
                  </button>
                </div>

                {hideNumbers ? (
                  <button
                    type="button"
                    onClick={() => setPeekTotal((v) => !v)}
                    aria-label={peekTotal ? "Sembunyikan lagi nominal total" : "Intip nominal total saldo"}
                    className="mt-1 text-left text-3xl font-extrabold tracking-tight tabular-nums underline decoration-dotted underline-offset-4 sm:text-4xl"
                  >
                    {formatMasked(totalAssets, peekTotal)}
                  </button>
                ) : (
                  <p className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums sm:text-4xl">
                    {formatRupiah(totalAssets)}
                  </p>
                )}
              </div>

              <div className="hidden sm:block">
                <OctopusMascot
                  mood={guriMood}
                  accessory={streak.accessory}
                  size={66}
                />
              </div>
            </div>

            {/* Income vs Expense summary + proportion bar */}
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-xs">
                <span className="flex items-center gap-1 text-xs font-medium text-[#F6D8DF]">
                  <ArrowInIcon className="h-3.5 w-3.5" />
                  Pemasukan
                </span>
                <span className="mt-1 block text-base font-extrabold tabular-nums">
                  {formatMasked(periodIncome, peekTotal)}
                </span>
              </div>
              <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-xs">
                <span className="flex items-center gap-1 text-xs font-medium text-[#F6D8DF]">
                  <ArrowOutIcon className="h-3.5 w-3.5" />
                  Pengeluaran
                </span>
                <span className="mt-1 block text-base font-extrabold tabular-nums">
                  {formatMasked(periodExpense, peekTotal)}
                </span>
              </div>
            </div>

            {totalFlow > 0 && (
              <div className="mt-3">
                <div className="flex justify-between text-[11px] font-bold text-[#F6D8DF] tabular-nums">
                  <span>Masuk {incomePct}%</span>
                  <span>Keluar {expensePct}%</span>
                </div>
                <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-black/25">
                  <div className="bg-[#34D399]" style={{ width: `${incomePct}%` }} />
                  <div className="bg-[#FDA4AF]" style={{ width: `${expensePct}%` }} />
                </div>
              </div>
            )}

            {/* Jatah Aman Harian Bar */}
            <div className="mt-4 rounded-2xl bg-black/25 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="block text-[11px] font-semibold text-[#F6D8DF]">
                    Jatah aman hari ini ({allowance.daysLeftInCycle} hari lagi ke reset siklus)
                  </span>
                  <span className="text-lg font-extrabold tabular-nums">
                    {formatMasked(allowance.dailyAllowance, peekTotal)} / hari
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onOpenFormula}
                  className="min-h-[36px] rounded-xl bg-white/15 px-3 text-xs font-bold text-white hover:bg-white/25"
                >
                  Rumus
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#F6D8DF] tabular-nums">
                <span>Sisa hari ini: {formatMasked(allowance.remainingToday, peekTotal)}</span>
                <span>Proyeksi besok: {formatMasked(allowance.projectedTomorrow, peekTotal)}</span>
              </div>
            </div>
          </div>

          {/* Slides 1..N: Individual Account Cards */}
          {accounts.map((acc) => {
            const theme = CARD_THEMES[acc.kind] || CARD_THEMES.cash;
            const sharePct =
              positivePool > 0 && acc.balance > 0
                ? Math.round((acc.balance / positivePool) * 100)
                : 0;
            const isRevealed = peekAccountId === acc.id;

            return (
              <div
                key={acc.id}
                style={{ background: theme.bg }}
                className="flex w-full shrink-0 snap-center flex-col justify-between p-5 text-white sm:p-6"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold"
                      style={{ color: theme.tint }}
                    >
                      {theme.label}
                    </span>
                    <span className="text-xs font-bold tabular-nums" style={{ color: theme.tint }}>
                      Porsi: {sharePct}%
                    </span>
                  </div>

                  <h2 className="mt-3 text-lg font-extrabold tracking-tight">
                    {acc.name}
                  </h2>

                  {hideNumbers ? (
                    <button
                      type="button"
                      onClick={() =>
                        setPeekAccountId((prev) => (prev === acc.id ? null : acc.id))
                      }
                      aria-label={isRevealed ? `Sembunyikan saldo ${acc.name}` : `Intip saldo ${acc.name}`}
                      className="mt-1 text-left text-3xl font-extrabold tracking-tight tabular-nums underline decoration-dotted underline-offset-4 sm:text-4xl"
                    >
                      {formatMasked(acc.balance, isRevealed)}
                    </button>
                  ) : (
                    <p className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums sm:text-4xl">
                      {formatRupiah(acc.balance)}
                    </p>
                  )}

                  {/* Share of total bar */}
                  <div className="mt-4">
                    <div className="flex justify-between text-[11px] font-semibold" style={{ color: theme.tint }}>
                      <span>Kontribusi ke total saldo positif</span>
                      <span className="tabular-nums">{sharePct}%</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-black/30">
                      <div
                        className="h-full rounded-full bg-white/85 transition-all duration-300"
                        style={{ width: `${Math.max(sharePct, acc.balance > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Account actions */}
                <div className="mt-5 flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() => onQuickCatatAccount(acc.id)}
                    className="flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-white px-4 text-xs font-extrabold text-[#1F0B10] hover:bg-white/90"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Catat di {acc.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenReconcile(acc.id)}
                    className="flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/15 px-4 text-xs font-extrabold text-white hover:bg-white/25"
                  >
                    <ScaleIcon className="h-4 w-4" />
                    Koreksi Saldo
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Left/Right Arrow Controls */}
        {activeSlide > 0 && (
          <button
            type="button"
            onClick={() => scrollToSlide(activeSlide - 1)}
            aria-label="Kartu rekening sebelumnya"
            className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white hover:bg-black/55"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
        )}
        {activeSlide < totalSlides - 1 && (
          <button
            type="button"
            onClick={() => scrollToSlide(activeSlide + 1)}
            aria-label="Kartu rekening berikutnya"
            className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white hover:bg-black/55"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Carousel Dots & Label */}
      <div className="mt-1 flex items-center justify-between gap-2 px-1">
        <div className="flex items-center" role="tablist" aria-label="Pilih kartu saldo">
          {[
            { key: "total", label: "Kartu Total Saldo" },
            ...accounts.map((acc) => ({ key: acc.id, label: `Kartu ${acc.name}` })),
          ].map((slide, slideNum) => {
            const active = activeSlide === slideNum;
            return (
              <button
                key={slide.key}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={slide.label}
                onClick={() => scrollToSlide(slideNum)}
                className="flex min-h-[40px] min-w-[32px] items-center justify-center px-1"
              >
                <span
                  aria-hidden="true"
                  className={`block h-2.5 rounded-full transition-all ${
                    active
                      ? "w-6 bg-[var(--brand-primary)]"
                      : "w-2.5 bg-[var(--border-subtle)] hover:bg-[var(--text-muted)]"
                  }`}
                />
              </button>
            );
          })}
        </div>
        <span className="text-[11px] font-semibold text-[var(--text-muted)]">
          Geser kartu untuk cek saldo tiap rekening
        </span>
      </div>
    </section>
  );
}

interface KoreksiSaldoModalProps {
  open: boolean;
  initialAccountId?: string;
  accounts: AccountWithBalance[];
  onClose: () => void;
  onSubmitReconcile: (payload: {
    accountId: string;
    actualBalance: number;
    note: string;
  }) => Promise<void>;
}

/** Balance reconciliation modal computing difference automatically without skewing income/expense. */
export function KoreksiSaldoModal({
  open,
  initialAccountId,
  accounts,
  onClose,
  onSubmitReconcile,
}: KoreksiSaldoModalProps) {
  const [accountId, setAccountId] = useState(initialAccountId || accounts[0]?.id || "acc-cash");
  const [actualRaw, setActualRaw] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const chosenId = initialAccountId || accounts[0]?.id || "acc-cash";
    setAccountId(chosenId);
    const chosen = accounts.find((a) => a.id === chosenId);
    setActualRaw(chosen && chosen.balance > 0 ? String(chosen.balance) : "");
    setNote("");
    setErrorMsg(null);
  }, [open, initialAccountId, accounts]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const selectedAcc = accounts.find((a) => a.id === accountId) || accounts[0];
  const recordedBalance = selectedAcc?.balance ?? 0;
  const hasTyped = actualRaw.trim() !== "";
  const actualBalance = hasTyped ? parseInt(actualRaw.replace(/\D/g, ""), 10) || 0 : recordedBalance;
  const diff = hasTyped ? actualBalance - recordedBalance : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasTyped) {
      setErrorMsg("Masukkan saldo asli saat ini terlebih dahulu.");
      return;
    }
    if (diff === 0) {
      setErrorMsg("Saldo asli sudah sama dengan catatan aplikasi.");
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      await onSubmitReconcile({
        accountId,
        actualBalance,
        note: note.trim(),
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal menyimpan koreksi saldo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reconcile-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="animate-sheet-up w-full max-w-md space-y-4 rounded-t-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--bg-soft)] text-[var(--brand-primary)] dark:text-[#fda4af]">
              <ScaleIcon className="h-4 w-4" />
            </span>
            <div>
              <h2 id="reconcile-title" className="text-base font-extrabold text-[var(--text-primary)]">
                Koreksi Saldo Akun
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Sesuaikan dengan saldo nyata tanpa mengacaukan statistik bulanan
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup form koreksi saldo"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-soft)]"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div>
          <label htmlFor="rec-acc" className="mb-1 block text-xs font-bold text-[var(--text-muted)]">
            Pilih Akun
          </label>
          <select
            id="rec-acc"
            value={accountId}
            onChange={(e) => {
              const nextId = e.target.value;
              setAccountId(nextId);
              const nextAcc = accounts.find((a) => a.id === nextId);
              setActualRaw(nextAcc && nextAcc.balance > 0 ? String(nextAcc.balance) : "");
              setErrorMsg(null);
            }}
            className="min-h-[44px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-sm font-bold text-[var(--text-primary)]"
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name} (Tercatat: {formatRupiah(acc.balance)})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-[var(--bg-canvas)] px-3.5 py-2.5 text-xs">
          <span className="font-semibold text-[var(--text-muted)]">Saldo tercatat di aplikasi</span>
          <strong className="text-sm font-extrabold text-[var(--text-primary)] tabular-nums">
            {formatRupiah(recordedBalance)}
          </strong>
        </div>

        <div>
          <label htmlFor="rec-actual" className="mb-1 block text-xs font-bold text-[var(--text-muted)]">
            Saldo Asli Saat Ini (Rp)
          </label>
          <div className="flex items-center rounded-2xl border-2 border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2.5 focus-within:border-[var(--brand-primary)] focus-within:ring-2 focus-within:ring-[var(--brand-ring)]">
            <span className="mr-2 text-base font-extrabold text-[var(--text-muted)]">Rp</span>
            <input
              id="rec-actual"
              type="text"
              inputMode="numeric"
              value={hasTyped ? actualBalance.toLocaleString("id-ID") : ""}
              onChange={(e) => {
                setActualRaw(e.target.value.replace(/\D/g, ""));
                setErrorMsg(null);
              }}
              placeholder="0"
              className="w-full bg-transparent text-xl font-extrabold text-[var(--text-primary)] tabular-nums focus:outline-none"
            />
          </div>
        </div>

        {hasTyped && (
          <div
            className={`rounded-xl px-3.5 py-2.5 text-xs font-bold tabular-nums ${
              diff > 0
                ? "bg-[var(--income-bg)] text-[var(--income-text)]"
                : diff < 0
                  ? "bg-[var(--expense-bg)] text-[var(--expense-text)]"
                  : "bg-[var(--bg-soft)] text-[var(--text-muted)]"
            }`}
          >
            {diff > 0
              ? `Selisih +${formatRupiah(diff)} akan dicatat sebagai Koreksi Tambah.`
              : diff < 0
                ? `Selisih ${formatRupiah(diff)} akan dicatat sebagai Koreksi Kurang.`
                : "Selisih Rp 0 (saldo sudah sesuai)."}
          </div>
        )}

        <div>
          <label htmlFor="rec-note" className="mb-1 block text-xs font-bold text-[var(--text-muted)]">
            Catatan (opsional)
          </label>
          <input
            id="rec-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Contoh: Saldo awal atau selisih biaya admin"
            className="min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs text-[var(--text-primary)]"
          />
        </div>

        {errorMsg && (
          <p role="alert" className="rounded-xl bg-[var(--expense-bg)] px-3 py-2 text-xs font-bold text-[var(--expense-text)]">
            {errorMsg}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !hasTyped || diff === 0}
          className="min-h-[46px] w-full rounded-2xl bg-[var(--brand-primary)] text-sm font-extrabold text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
        >
          {busy ? "Menyimpan..." : "Simpan Koreksi Saldo"}
        </button>
      </form>
    </div>
  );
}
