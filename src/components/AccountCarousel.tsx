"use client";

import React, { useEffect, useState } from "react";
import { formatRupiah } from "@/lib/finance";
import type { Account } from "@/lib/types";
import { CloseIcon } from "./Icons";

type AccountWithBalance = Account & { balance: number };

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
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(0,0,0,0.55)] p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reconcile-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="animate-sheet-up max-h-sheet w-full max-w-md space-y-4 overflow-y-auto rounded-t-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 id="reconcile-title" className="text-base font-extrabold text-[var(--text-primary)]">
              Koreksi Saldo Akun
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Samakan saldo di aplikasi dengan uang nyata
            </p>
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
          <div className="flex items-center rounded-xl border-2 border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2.5 focus-within:border-[var(--brand-primary)] focus-within:ring-2 focus-within:ring-[var(--brand-ring)]">
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
              className="w-full bg-transparent text-xl font-extrabold text-[var(--text-primary)] tabular-nums outline-none focus:outline-none focus-visible:outline-none"
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
          className="min-h-[46px] w-full rounded-xl bg-[var(--brand-primary)] text-sm font-extrabold text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
        >
          {busy ? "Menyimpan..." : "Simpan Koreksi Saldo"}
        </button>
      </form>
    </div>
  );
}
