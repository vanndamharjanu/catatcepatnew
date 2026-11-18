"use client";

import React, { useEffect, useState } from "react";
import type { AppDatabase, WorkspaceSettings } from "@/lib/types";
import { CloseIcon } from "./Icons";

interface SheetsDrawerProps {
  open: boolean;
  db: AppDatabase;
  onClose: () => void;
  onStateUpdated: (next: AppDatabase) => void;
  onTriggerSync?: (full?: boolean) => Promise<void> | void;
  onNotify: (msg: string) => void;
}

export function SheetsDrawer({
  open,
  db,
  onClose,
  onStateUpdated,
  onTriggerSync,
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
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [migrateLocalOnAuth, setMigrateLocalOnAuth] = useState(true);
  const [authInfoMsg, setAuthInfoMsg] = useState<string | null>(null);

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
        setErrorMsg(data.error || "Koneksi Google Sheets belum tersedia.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setErrorMsg("Gagal menghubungkan ke Google Sheets.");
    } finally {
      setBusy(false);
    }
  };

  const handleSyncOrPreview = async (full = false) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/sheets/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        mode?: "preview" | "live";
        previewRows?: string[][];
        syncedCount?: number;
        state?: AppDatabase;
        error?: string;
      };
      if (data.state) {
        onStateUpdated(data.state);
      }
      if (!res.ok) throw new Error(data.error || "Gagal sinkronisasi.");
      if (data.mode === "preview" && data.previewRows) {
        setPreviewRows(data.previewRows);
      } else if (data.state) {
        const count = data.syncedCount ?? 0;
        if (full) {
          onNotify(`Sinkronisasi ulang penuh selesai (${count} baris).`);
        } else if (count === 0) {
          onNotify("Semua data sudah tersinkron dengan Google Sheets.");
        } else {
          onNotify(`Berhasil sinkron ${count} perubahan ke Google Sheets.`);
        }
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
      if (data.state.sheetConnection.connected) {
        void onTriggerSync?.(false);
      }
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
      if (next.sheetConnection.connected) {
        void onTriggerSync?.(true);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal menghapus semua data.");
    } finally {
      setBusy(false);
    }
  };

  const { sheetConnection, auth } = db;
  const pendingTxCount = sheetConnection.connected
    ? db.transactions.filter((t) => t.sheetSyncStatus === "pending").length
    : 0;
  const pendingDeleteCount = sheetConnection.connected
    ? (sheetConnection.pendingDeletes?.length ?? 0)
    : 0;
  const totalPendingCount = pendingTxCount + pendingDeleteCount;

  const handleSupabaseGoogleLogin = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/auth?provider=google");
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Gagal memulai login Google.");
      window.location.href = data.url;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal memulai login Google.");
      setBusy(false);
    }
  };

  const handleSupabaseAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    setAuthInfoMsg(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: authMode,
          email: authEmail,
          password: authPassword,
          migrateLocal: migrateLocalOnAuth,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        state?: AppDatabase;
        needsEmailConfirmation?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Gagal memproses autentikasi.");
      if (data.needsEmailConfirmation) {
        setAuthInfoMsg(data.message || "Cek email Anda untuk verifikasi pendaftaran.");
        return;
      }
      if (data.state) {
        onStateUpdated(data.state);
        setAuthPassword("");
        onNotify(
          authMode === "register"
            ? "Akun berhasil dibuat dan terhubung."
            : `Berhasil masuk sebagai ${data.state.auth?.email || authEmail}.`,
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal masuk ke akun.");
    } finally {
      setBusy(false);
    }
  };

  const handleSupabaseLogout = async () => {
    setBusy(true);
    setErrorMsg(null);
    setAuthInfoMsg(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      const data = (await res.json().catch(() => ({}))) as { state?: AppDatabase; error?: string };
      if (!res.ok || !data.state) throw new Error(data.error || "Gagal keluar akun.");
      onStateUpdated(data.state);
      onNotify("Anda sudah keluar dari akun.");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal keluar akun.");
    } finally {
      setBusy(false);
    }
  };

  const handleMigrateLocalToCloud = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "migrate_local" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        migratedCount?: number;
        state?: AppDatabase;
        error?: string;
      };
      if (!res.ok || !data.state) throw new Error(data.error || "Gagal memindahkan catatan.");
      onStateUpdated(data.state);
      onNotify(`Berhasil menyimpan ${data.migratedCount ?? 0} catatan ke akun Anda.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal menyalin data lokal.");
    } finally {
      setBusy(false);
    }
  };

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
      <div className="animate-sheet-up flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
          <div>
            <h2 id="drawer-sheets-title" className="text-base font-extrabold text-[var(--text-primary)]">
              Pengaturan Akun &amp; Google Sheets
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Sinkronisasi spreadsheet &amp; target anggaran
            </p>
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
          {/* Akun & Penyimpanan Online */}
          <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
                  Akun &amp; Penyimpanan Online
                </h3>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {auth?.authenticated
                    ? `Masuk sebagai ${auth.email || "Pengguna"} (data tersimpan aman dan pribadi)`
                    : auth?.configured
                      ? "Masuk atau daftar agar catatan Anda tersimpan aman dan bisa dibuka di perangkat lain."
                      : "Penyimpanan online belum diaktifkan di server ini. Catatan sementara tersimpan di perangkat ini."}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  auth?.authenticated
                    ? "bg-[var(--income-bg)] text-[var(--income-text)]"
                    : "bg-[var(--bg-soft)] text-[var(--brand-primary)] dark:text-[#fda4af]"
                }`}
              >
                {auth?.authenticated
                  ? "Sudah Masuk"
                  : auth?.configured
                    ? "Belum Masuk"
                    : "Di Perangkat"}
              </span>
            </div>

            {auth?.configured && !auth?.authenticated && (
              <form onSubmit={handleSupabaseAuth} className="mt-3 space-y-2.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSupabaseGoogleLogin}
                  className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3.5 text-xs font-extrabold text-[var(--text-primary)] hover:bg-[var(--bg-soft)] disabled:opacity-60"
                >
                  <span>Lanjutkan dengan Akun Google</span>
                </button>

                <div className="flex gap-1.5 rounded-xl bg-[var(--bg-card)] p-1 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("login");
                      setAuthInfoMsg(null);
                    }}
                    className={`flex-1 rounded-lg py-1.5 ${
                      authMode === "login"
                        ? "bg-[var(--brand-primary)] text-white"
                        : "text-[var(--text-muted)]"
                    }`}
                  >
                    Masuk
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("register");
                      setAuthInfoMsg(null);
                    }}
                    className={`flex-1 rounded-lg py-1.5 ${
                      authMode === "register"
                        ? "bg-[var(--brand-primary)] text-white"
                        : "text-[var(--text-muted)]"
                    }`}
                  >
                    Daftar Baru
                  </button>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    type="email"
                    required
                    placeholder="Email Anda"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="min-h-[40px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 text-xs font-bold text-[var(--text-primary)]"
                  />
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="Password (min. 6 karakter)"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="min-h-[40px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 text-xs font-bold text-[var(--text-primary)]"
                  />
                </div>

                <label className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                  <input
                    type="checkbox"
                    checked={migrateLocalOnAuth}
                    onChange={(e) => setMigrateLocalOnAuth(e.target.checked)}
                    className="rounded"
                  />
                  <span>Pindahkan catatan di perangkat ini ke akun saya setelah masuk</span>
                </label>

                {authInfoMsg && (
                  <p className="rounded-xl bg-[var(--bg-soft)] px-3 py-2 text-xs font-bold text-[var(--brand-primary)] dark:text-[#fda4af]">
                    {authInfoMsg}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="min-h-[40px] rounded-xl bg-[var(--brand-primary)] px-4 text-xs font-bold text-white hover:bg-[var(--brand-hover)] disabled:opacity-60"
                >
                  {authMode === "register" ? "Daftar & Buat Akun" : "Masuk ke Akun"}
                </button>
              </form>
            )}

            {auth?.authenticated && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleMigrateLocalToCloud}
                  className="min-h-[40px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)] disabled:opacity-60"
                >
                  Simpan Catatan Ini ke Akun
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSupabaseLogout}
                  className="min-h-[40px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3.5 text-xs font-bold text-[var(--expense-text)] disabled:opacity-60"
                >
                  Keluar Akun
                </button>
              </div>
            )}
          </section>

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
                      ? "Siap dihubungkan ke Google Sheets milik Anda (hanya mengakses file buatan CatatCepat)."
                      : "Koneksi Google Sheets belum aktif di server ini."}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  sheetConnection.connected
                    ? "bg-[var(--income-bg)] text-[var(--income-text)]"
                    : "bg-[var(--bg-soft)] text-[var(--brand-primary)] dark:text-[#fda4af]"
                }`}
              >
                {sheetConnection.connected ? "Terhubung" : "Belum Terhubung"}
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

            {sheetConnection.connected && (
              <div className="mt-2.5 space-y-1.5 text-[11px]">
                {totalPendingCount > 0 ? (
                  <p className="rounded-lg bg-[var(--bg-soft)] px-2.5 py-1.5 font-bold text-[var(--brand-primary)] dark:text-[#fda4af]">
                    Menunggu sinkronisasi: {pendingTxCount} transaksi, {pendingDeleteCount} hapus
                  </p>
                ) : (
                  <p className="text-[var(--text-muted)]">
                    Semua perubahan tersinkron
                    {sheetConnection.lastSyncedAt
                      ? ` (${new Date(sheetConnection.lastSyncedAt).toLocaleString("id-ID")})`
                      : ""}
                    .
                  </p>
                )}
                {sheetConnection.lastError && (
                  <p
                    role="alert"
                    className="rounded-lg bg-[var(--expense-bg)] px-2.5 py-1.5 font-bold text-[var(--expense-text)]"
                  >
                    Sync terakhir terkendala: {sheetConnection.lastError}
                  </p>
                )}
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
                  Hubungkan Google Sheets
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
                onClick={() => handleSyncOrPreview(false)}
                className="min-h-[42px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)] disabled:opacity-60"
              >
                {sheetConnection.connected ? "Sinkron Sekarang" : "Lihat Pratinjau Tabel"}
              </button>

              {sheetConnection.connected && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleSyncOrPreview(true)}
                  className="min-h-[42px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 text-xs font-bold text-[var(--text-muted)] hover:bg-[var(--bg-soft)] hover:text-[var(--text-primary)] disabled:opacity-60"
                >
                  Sinkron Ulang Penuh
                </button>
              )}
            </div>

            {previewRows && (
              <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5">
                <p className="mb-1.5 text-[11px] font-bold text-[var(--text-muted)]">
                  Pratinjau susunan tabel di Google Sheets (baris yang diubah atau dihapus akan ikut menyesuaikan otomatis):
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
                <option value="umum">Umum / Keluarga (Gaji, Tunjangan, Bonus, Usaha Sampingan, Lain-lain)</option>
                <option value="asn_karyawan">ASN / Karyawan (Gaji, Tunjangan, Bonus, THR, Lain-lain)</option>
                <option value="mahasiswa">Mahasiswa (Uang Saku, Beasiswa, Lain-lain)</option>
                <option value="freelancer">Freelance (Proyek Klien, Retainer, Royalti, Produk, Lain-lain)</option>
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
              Impor Data dari CatatCepat Lama
            </h3>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Tempel isi file hasil unduhan CatatCepat versi sebelumnya (Tanggal,Jenis,Nominal,Kategori,Keterangan).
            </p>
            <label
              htmlFor="legacy-csv-input"
              className="mt-2 block text-xs font-bold text-[var(--text-muted)]"
            >
              Isi Data Catatan
            </label>
            <textarea
              id="legacy-csv-input"
              rows={3}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={"Tanggal,Jenis,Nominal,Kategori,Keterangan\n16-11-2026,Keluar,25000,Makan & Minum,Nasi Padang"}
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5 text-xs text-[var(--text-primary)]"
            />
            <button
              type="button"
              disabled={busy}
              onClick={handleImportCsv}
              className="mt-2 min-h-[40px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
            >
              Impor Data
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
                Hapus semua catatan saya
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
