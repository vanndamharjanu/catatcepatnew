"use client";

import React, { useEffect, useState } from "react";
import type { AppDatabase, WorkspaceSettings } from "@/lib/types";
import { CloseIcon, SheetIcon } from "./Icons";

interface SheetsDrawerProps {
  open: boolean;
  db: AppDatabase;
  onClose: () => void;
  onStateUpdated: (next: AppDatabase) => void;
  onNotify: (msg: string) => void;
}

export function SheetsDrawer({
  open,
  db,
  onClose,
  onStateUpdated,
  onNotify,
}: SheetsDrawerProps) {
  const [budgetText, setBudgetText] = useState(String(db.settings.monthlyBudget));
  const [paydayDay, setPaydayDay] = useState(String(db.settings.paydayDay));
  const [preset, setPreset] = useState<WorkspaceSettings["categoryPreset"]>(
    db.settings.categoryPreset,
  );
  const [initialBalances, setInitialBalances] = useState<Record<string, string>>({});
  const [csvText, setCsvText] = useState("");
  const [previewRows, setPreviewRows] = useState<string[][] | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBudgetText(String(db.settings.monthlyBudget));
    setPaydayDay(String(db.settings.paydayDay));
    setPreset(db.settings.categoryPreset);
    setInitialBalances(
      Object.fromEntries(db.accounts.map((acc) => [acc.id, String(acc.initialBalance || 0)])),
    );
    setErrorMsg(null);
    setConfirmClear(false);
  }, [open, db.settings, db.accounts]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    try {
      const budget = parseInt(budgetText.replace(/\D/g, ""), 10) || 0;
      const day = Math.min(28, Math.max(1, parseInt(paydayDay, 10) || 1));
      const numericInitialBalances = Object.fromEntries(
        db.accounts.map((acc) => [
          acc.id,
          parseInt((initialBalances[acc.id] ?? "0").replace(/\D/g, ""), 10) || 0,
        ]),
      );
      const res = await fetch("/api/state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyBudget: budget,
          paydayDay: day,
          categoryPreset: preset,
          initialBalances: numericInitialBalances,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as AppDatabase & { error?: string };
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan pengaturan.");
      onStateUpdated(data);
      onNotify("Pengaturan anggaran, saldo awal, dan preset diperbarui.");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  };

  const handleConnectGoogle = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/sheets/connect");
      const data = (await res.json().catch(() => ({}))) as {
        configured?: boolean;
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        setErrorMsg(data.error || "Google OAuth belum dikonfigurasi.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setErrorMsg("Gagal memulai koneksi OAuth Google.");
    } finally {
      setBusy(false);
    }
  };

  const handleSyncOrPreview = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/sheets/sync", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        mode?: "preview" | "live";
        previewRows?: string[][];
        syncedCount?: number;
        state?: AppDatabase;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Gagal sinkronisasi.");
      if (data.mode === "preview" && data.previewRows) {
        setPreviewRows(data.previewRows);
      } else if (data.state) {
        onStateUpdated(data.state);
        onNotify(`Berhasil sinkron ${data.syncedCount ?? 0} transaksi ke Google Sheets.`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal sinkron.");
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnectSheets = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/sheets/sync", { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as AppDatabase & { error?: string };
      if (!res.ok) throw new Error(data.error || "Gagal memutus koneksi Google Sheets.");
      onStateUpdated(data);
      setPreviewRows(null);
      onNotify("Koneksi Google Sheets diputus.");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal memutus koneksi Google Sheets.");
    } finally {
      setBusy(false);
    }
  };

  const handleImportCsv = async () => {
    if (!csvText.trim()) {
      setErrorMsg("Tempel isi CSV ekspor CatatCepat terlebih dahulu.");
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/import/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        importedCount?: number;
        state?: AppDatabase;
        error?: string;
      };
      if (!res.ok || !data.state) throw new Error(data.error || "CSV gagal dibaca.");
      onStateUpdated(data.state);
      setCsvText("");
      onNotify(`Berhasil mengimpor ${data.importedCount} transaksi dari CSV.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal mengimpor CSV.");
    } finally {
      setBusy(false);
    }
  };

  const handleClearAll = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_all_data" }),
      });
      const next = (await res.json().catch(() => ({}))) as AppDatabase & { error?: string };
      if (!res.ok) throw new Error(next.error || "Gagal menghapus semua data.");
      onStateUpdated(next);
      setConfirmClear(false);
      onNotify("Semua transaksi dan target dibersihkan.");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal menghapus semua data.");
    } finally {
      setBusy(false);
    }
  };

  const { sheetConnection } = db;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-sheets-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="animate-sheet-up flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--bg-soft)] text-[var(--brand-primary)] dark:text-[#fda4af]">
              <SheetIcon className="h-5 w-5" />
            </span>
            <div>
              <h2 id="drawer-sheets-title" className="text-base font-extrabold text-[var(--text-primary)]">
                Sync Google Sheets & Pengaturan SaaS
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Data cepat di workspace lokal/DB, tetap terhubung ke Google Sheets pribadi
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengaturan Google Sheets"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-soft)]"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-4">
          {/* Google Sheets Connector Card */}
          <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
                  Status Koneksi Google Sheets
                </h3>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {sheetConnection.connected
                    ? `Terhubung ke ${sheetConnection.googleEmail || "akun Google"}`
                    : sheetConnection.configured
                      ? "Siap dihubungkan dengan OAuth scope drive.file (non-sensitive)"
                      : "Mode Lokal aktif. Isi GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET di .env.local untuk OAuth live."}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  sheetConnection.connected
                    ? "bg-[var(--income-bg)] text-[var(--income-text)]"
                    : "bg-[var(--bg-soft)] text-[var(--brand-primary)] dark:text-[#fda4af]"
                }`}
              >
                {sheetConnection.connected ? "Terhubung" : "Mode Lokal"}
              </span>
            </div>

            {sheetConnection.spreadsheetUrl && (
              <div className="mt-3 rounded-xl bg-[var(--bg-card)] p-2.5 text-xs">
                <a
                  href={sheetConnection.spreadsheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-[var(--brand-primary)] underline dark:text-[#fda4af]"
                >
                  Buka Spreadsheet CatatCepat di Google Drive
                </a>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {!sheetConnection.connected ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleConnectGoogle}
                  className="min-h-[42px] rounded-xl bg-[var(--brand-primary)] px-4 text-xs font-bold text-white hover:bg-[var(--brand-hover)] disabled:opacity-60"
                >
                  Hubungkan Google Sheets (OAuth)
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleDisconnectSheets}
                  className="min-h-[42px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 text-xs font-bold text-[var(--expense-text)]"
                >
                  Putuskan Koneksi
                </button>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={handleSyncOrPreview}
                className="min-h-[42px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
              >
                {sheetConnection.connected ? "Sinkron Sekarang" : "Lihat Pratinjau Baris UUID"}
              </button>
            </div>

            {previewRows && (
              <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5">
                <p className="mb-1.5 text-[11px] font-bold text-[var(--text-muted)]">
                  Pratinjau 8 kolom sinkronisasi (kunci UUID mencegah salah edit baris):
                </p>
                <table className="w-full text-left text-[11px] tabular-nums">
                  <tbody>
                    {previewRows.map((row, idx) => (
                      <tr
                        key={idx}
                        className={idx === 0 ? "border-b border-[var(--border-subtle)] font-bold" : ""}
                      >
                        {row.slice(0, 6).map((cell, cIdx) => (
                          <td key={cIdx} className="whitespace-nowrap px-2 py-1">
                            {cIdx === 0 && idx > 0 ? `${cell.slice(0, 8)}...` : cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Budget & Preset Form */}
          <form
            onSubmit={handleSaveSettings}
            className="space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4"
          >
            <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
              Anggaran Bulanan & Preset Kategori
            </h3>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="setting-budget"
                  className="mb-1 block text-xs font-bold text-[var(--text-muted)]"
                >
                  Target Budget per Siklus (Rp)
                </label>
                <input
                  id="setting-budget"
                  type="text"
                  inputMode="numeric"
                  value={(parseInt(budgetText.replace(/\D/g, ""), 10) || 0).toLocaleString("id-ID")}
                  onChange={(e) => setBudgetText(e.target.value.replace(/\D/g, ""))}
                  className="min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 text-sm font-bold text-[var(--text-primary)] tabular-nums"
                />
              </div>
              <div>
                <label
                  htmlFor="setting-payday"
                  className="mb-1 block text-xs font-bold text-[var(--text-muted)]"
                >
                  Tanggal Mulai Siklus / Gajian (1-28)
                </label>
                <input
                  id="setting-payday"
                  type="number"
                  min={1}
                  max={28}
                  value={paydayDay}
                  onChange={(e) => setPaydayDay(e.target.value)}
                  className="min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 text-sm font-bold text-[var(--text-primary)] tabular-nums"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="setting-preset"
                className="mb-1 block text-xs font-bold text-[var(--text-muted)]"
              >
                Preset Kategori Bawaan
              </label>
              <select
                id="setting-preset"
                value={preset}
                onChange={(e) =>
                  setPreset(e.target.value as WorkspaceSettings["categoryPreset"])
                }
                className="min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 text-xs font-bold text-[var(--text-primary)]"
              >
                <option value="asn_karyawan">ASN & Karyawan (Gaji, TPP, TPG, Bonus)</option>
                <option value="umum">Umum / Keluarga</option>
                <option value="mahasiswa">Mahasiswa (Uang Saku, Kost)</option>
                <option value="freelancer">Freelancer (Proyek, Retainer)</option>
              </select>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-bold text-[var(--text-muted)]">
                Saldo Awal Akun (Rp)
              </span>
              <div className="grid gap-2 sm:grid-cols-3">
                {db.accounts.map((acc) => {
                  const raw = initialBalances[acc.id] ?? String(acc.initialBalance || 0);
                  const numeric = parseInt(raw.replace(/\D/g, ""), 10) || 0;
                  return (
                    <div key={acc.id}>
                      <label
                        htmlFor={`init-bal-${acc.id}`}
                        className="mb-1 block text-[11px] font-semibold text-[var(--text-muted)]"
                      >
                        {acc.name}
                      </label>
                      <input
                        id={`init-bal-${acc.id}`}
                        type="text"
                        inputMode="numeric"
                        value={numeric.toLocaleString("id-ID")}
                        onChange={(e) =>
                          setInitialBalances((prev) => ({
                            ...prev,
                            [acc.id]: e.target.value.replace(/\D/g, ""),
                          }))
                        }
                        className="min-h-[40px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 text-xs font-bold text-[var(--text-primary)] tabular-nums"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="min-h-[42px] rounded-xl bg-[var(--brand-primary)] px-4 text-xs font-bold text-white hover:bg-[var(--brand-hover)]"
            >
              Simpan Pengaturan
            </button>
          </form>

          {/* Legacy CSV Importer */}
          <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4">
            <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
              Migrasi Data dari CatatCepat Lama (CSV)
            </h3>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Tempel isi file CSV hasil Export CSV dari versi GitHub Pages (Tanggal,Jenis,Nominal,Kategori,Keterangan).
            </p>
            <label
              htmlFor="legacy-csv-input"
              className="mt-2 block text-xs font-bold text-[var(--text-muted)]"
            >
              Isi Data CSV
            </label>
            <textarea
              id="legacy-csv-input"
              rows={3}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={"Tanggal,Jenis,Nominal,Kategori,Keterangan\n16/11/2026,Keluar,25000,Makan & Minum,Nasi Padang"}
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5 text-xs text-[var(--text-primary)]"
            />
            <button
              type="button"
              disabled={busy}
              onClick={handleImportCsv}
              className="mt-2 min-h-[40px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
            >
              Impor Data CSV
            </button>
          </section>

          {errorMsg && (
            <p role="alert" className="rounded-xl bg-[var(--expense-bg)] px-3 py-2 text-xs font-bold text-[var(--expense-text)]">
              {errorMsg}
            </p>
          )}

          {/* Reset workspace */}
          <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">
            {!confirmClear ? (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="text-xs font-bold text-[var(--expense-text)] hover:underline"
              >
                Hapus semua data workspace
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[var(--expense-text)]">Yakin hapus semua?</span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="rounded-lg bg-[#BE123C] px-3 py-1.5 text-xs font-bold text-white"
                >
                  Ya, Hapus
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="rounded-lg bg-[var(--bg-soft)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)]"
                >
                  Batal
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
