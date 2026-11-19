"use client";

import React, { useEffect, useState } from "react";
import { readBrowserDemoExport } from "@/lib/client-demo";
import type {
  AccountKind,
  AppDatabase,
  RecurringTemplate,
  ThemeKey,
  WorkspaceSettings,
} from "@/lib/types";
import { CloseIcon } from "./Icons";
import { ThemeDots } from "./ThemeDots";

export type SettingsTabKey = "sheets" | "atur" | "akun";

interface SheetsDrawerProps {
  open: boolean;
  initialTab?: SettingsTabKey;
  isDemoMode?: boolean;
  db: AppDatabase;
  themeColor: ThemeKey;
  onChangeTheme: (next: ThemeKey) => void;
  onClose: () => void;
  onStateUpdated: (next: AppDatabase) => void;
  onSaveSettings: (payload: {
    monthlyBudget: number;
    paydayDay: number;
    categoryPreset: WorkspaceSettings["categoryPreset"];
    initialBalances: Record<string, number>;
  }) => Promise<void>;
  onAddAccount: (
    name: string,
    kind: AccountKind,
    initialBalance: number,
  ) => Promise<void>;
  onDeleteAccount: (accountId: string) => Promise<void>;
  onClearAll: () => Promise<void>;
  onTriggerSync?: (full?: boolean) => Promise<void> | void;
  onNotify: (msg: string) => void;
  recurring?: RecurringTemplate[];
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function SheetsDrawer({
  open,
  initialTab = "sheets",
  isDemoMode = false,
  db,
  themeColor,
  onChangeTheme,
  onClose,
  onStateUpdated,
  onSaveSettings,
  onAddAccount,
  onDeleteAccount,
  onClearAll,
  onTriggerSync,
  onNotify,
  recurring = [],
}: SheetsDrawerProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabKey>(initialTab);
  const [budgetText, setBudgetText] = useState(
    String(db.settings.monthlyBudget),
  );
  const [paydayDay, setPaydayDay] = useState(String(db.settings.paydayDay));
  const [preset, setPreset] = useState<WorkspaceSettings["categoryPreset"]>(
    db.settings.categoryPreset,
  );
  const [initialBalances, setInitialBalances] = useState<
    Record<string, string>
  >({});
  const [csvText, setCsvText] = useState("");
  const [previewRows, setPreviewRows] = useState<string[][] | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    if (!open || isDemoMode) return;
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setPushSubscribed(Boolean(sub)))
      .catch(() => {});
  }, [open, isDemoMode]);

  const handleTogglePush = async () => {
    if (isDemoMode) {
      onNotify("Masuk dengan akun Google/Email untuk mengaktifkan notifikasi PWA.");
      return;
    }
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      onNotify("Browser atau perangkat ini belum mendukung Web Push PWA.");
      return;
    }
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || "";
    if (!vapidKey) {
      onNotify("VAPID public key belum dikonfigurasi di server.");
      return;
    }

    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        });
        await existing.unsubscribe();
        setPushSubscribed(false);
        onNotify("Notifikasi pengingat PWA dinonaktifkan.");
      } else {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          throw new Error(
            "Izin notifikasi ditolak. Aktifkan izin notifikasi di pengaturan browser.",
          );
        }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        });
        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: sub.toJSON(),
            recurring,
            sendTest: true,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          throw new Error(data.error || "Gagal mengaktifkan notifikasi.");
        }
        setPushSubscribed(true);
        onNotify("Notifikasi pengingat PWA aktif! Cek notifikasi tes di HP.");
      }
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : "Gagal mengatur notifikasi PWA.",
      );
    } finally {
      setPushBusy(false);
    }
  };
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [migrateLocalOnAuth, setMigrateLocalOnAuth] = useState(false);
  const [authInfoMsg, setAuthInfoMsg] = useState<string | null>(null);
  const [newAccName, setNewAccName] = useState("");
  const [newAccKind, setNewAccKind] = useState<AccountKind>("bank");
  const [newAccBalance, setNewAccBalance] = useState("");
  const [addingAccount, setAddingAccount] = useState(false);

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab);
    setBudgetText(String(db.settings.monthlyBudget));
    setPaydayDay(String(db.settings.paydayDay));
    setPreset(db.settings.categoryPreset);
    setInitialBalances(
      Object.fromEntries(
        db.accounts.map((acc) => [acc.id, String(acc.initialBalance || 0)]),
      ),
    );
    setErrorMsg(null);
    setConfirmClear(false);
  }, [open, initialTab, db.settings, db.accounts]);

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
      const day = parseInt(paydayDay, 10);
      if (!day || day < 1 || day > 31) {
        setErrorMsg("Tanggal gajian harus antara 1 sampai 31.");
        setBusy(false);
        return;
      }
      const numericInitialBalances = Object.fromEntries(
        db.accounts.map((acc) => [
          acc.id,
          parseInt((initialBalances[acc.id] ?? "0").replace(/\D/g, ""), 10) ||
            0,
        ]),
      );
      await onSaveSettings({
        monthlyBudget: budget,
        paydayDay: day,
        categoryPreset: preset,
        initialBalances: numericInitialBalances,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  };

  const handleAddAccountClick = async () => {
    const clean = newAccName.trim();
    if (!clean) {
      setErrorMsg("Nama dompet baru wajib diisi.");
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      const initBal = parseInt(newAccBalance.replace(/\D/g, ""), 10) || 0;
      await onAddAccount(clean, newAccKind, initBal);
      setNewAccName("");
      setNewAccBalance("");
      setAddingAccount(false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Gagal menambah dompet.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAccountClick = async (accountId: string) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await onDeleteAccount(accountId);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Gagal menghapus dompet.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleConnectGoogle = async () => {
    if (isDemoMode) {
      setErrorMsg(
        "Masuk ke akun Anda di tab Akun & Data terlebih dahulu agar Google Sheets tersimpan aman.",
      );
      setActiveTab("akun");
      return;
    }
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
    if (isDemoMode) {
      const rows: string[][] = [
        ["Transaction ID", "Tanggal", "Jenis", "Kategori", "Akun", "Nominal"],
        ...db.transactions
          .slice(0, 8)
          .map((tx) => [
            tx.id,
            tx.date,
            tx.type,
            tx.category,
            db.accounts.find((a) => a.id === tx.accountId)?.name ||
              tx.accountId,
            String(tx.amount),
          ]),
      ];
      setPreviewRows(rows);
      return;
    }
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
      if (data.state) onStateUpdated(data.state);
      if (!res.ok) throw new Error(data.error || "Gagal sinkronisasi.");
      if (data.mode === "preview" && data.previewRows) {
        setPreviewRows(data.previewRows);
      } else if (data.state) {
        const count = data.syncedCount ?? 0;
        if (full) {
          onNotify(`Sinkronisasi ulang penuh selesai (${count} baris).`);
        } else if (count === 0) {
          onNotify("Semua catatan sudah tersinkron dengan Google Sheets.");
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
      const data = (await res.json().catch(() => ({}))) as AppDatabase & {
        error?: string;
      };
      if (!res.ok)
        throw new Error(data.error || "Gagal memutus koneksi Google Sheets.");
      onStateUpdated(data);
      setPreviewRows(null);
      onNotify("Koneksi Google Sheets diputus.");
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Gagal memutus koneksi Google Sheets.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleImportCsv = async () => {
    if (!csvText.trim()) {
      setErrorMsg("Tempel isi data catatan terlebih dahulu.");
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
      if (!res.ok || !data.state)
        throw new Error(data.error || "Data gagal dibaca.");
      onStateUpdated(data.state);
      setCsvText("");
      onNotify(`Berhasil mengimpor ${data.importedCount} transaksi.`);
      if (data.state.sheetConnection.connected) {
        void onTriggerSync?.(false);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal mengimpor data.");
    } finally {
      setBusy(false);
    }
  };

  const handleClearAll = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await onClearAll();
      setConfirmClear(false);
      if (!isDemoMode && db.sheetConnection.connected) {
        void onTriggerSync?.(true);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Gagal menghapus semua data.",
      );
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
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url)
        throw new Error(data.error || "Gagal memulai login Google.");
      window.location.href = data.url;
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Gagal memulai login Google.",
      );
      setBusy(false);
    }
  };

  const handleSupabaseAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    setAuthInfoMsg(null);
    try {
      const localExport = migrateLocalOnAuth
        ? readBrowserDemoExport()
        : { transactions: [], goals: [] };
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: authMode,
          email: authEmail,
          password: authPassword,
          migrateLocal: migrateLocalOnAuth,
          localTransactions: localExport.transactions,
          localGoals: localExport.goals,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        state?: AppDatabase;
        needsEmailConfirmation?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Gagal memproses akun.");
      if (data.needsEmailConfirmation) {
        setAuthInfoMsg(
          data.message || "Cek email Anda untuk verifikasi pendaftaran.",
        );
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
      const data = (await res.json().catch(() => ({}))) as {
        state?: AppDatabase;
        error?: string;
      };
      if (!res.ok || !data.state)
        throw new Error(data.error || "Gagal keluar akun.");
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
      const localExport = readBrowserDemoExport();
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "migrate_local",
          localTransactions: localExport.transactions,
          localGoals: localExport.goals,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        migratedCount?: number;
        state?: AppDatabase;
        error?: string;
      };
      if (!res.ok || !data.state)
        throw new Error(data.error || "Gagal memindahkan catatan.");
      onStateUpdated(data.state);
      onNotify(
        `Berhasil menyimpan ${data.migratedCount ?? 0} catatan ke akun Anda.`,
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Gagal memindahkan catatan.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(0,0,0,0.55)] p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-sheets-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="animate-sheet-up max-h-sheet flex w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-2xl sm:rounded-2xl">
        {/* Sticky Header + 3 Crisp Tabs */}
        <div className="border-b border-[var(--border-subtle)] px-5 pb-3 pt-4">
          <div className="flex items-center justify-between gap-2">
            <h2
              id="drawer-sheets-title"
              className="text-base font-extrabold text-[var(--text-primary)]"
            >
              Sheets &amp; Pengaturan
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup pengaturan"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-soft)]"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          <div
            role="tablist"
            aria-label="Kategori pengaturan"
            className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-[var(--bg-soft)] p-1 text-xs font-bold"
          >
            {(
              [
                { key: "sheets", label: "Google Sheets" },
                { key: "atur", label: "Tema & Atur" },
                { key: "akun", label: "Akun & Data" },
              ] as const
            ).map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.key)}
                  className={`min-h-[36px] rounded-lg transition-colors ${
                    active
                      ? "bg-[var(--brand-primary)] text-white"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Focused Single-Tab Content */}
        <div className="space-y-4 overflow-y-auto px-5 pb-6 pt-4">
          {activeTab === "sheets" && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
                    Koneksi Google Sheets
                  </h3>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {sheetConnection.connected
                      ? `Terhubung ke ${sheetConnection.googleEmail || "akun Google"}`
                      : sheetConnection.configured
                        ? "Klik tombol di bawah untuk membuat file Google Sheets otomatis."
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
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 text-xs">
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
                <div className="text-xs">
                  {totalPendingCount > 0 ? (
                    <p className="rounded-xl bg-[var(--bg-soft)] px-3 py-2 font-bold text-[var(--brand-primary)] dark:text-[#fda4af]">
                      Menunggu sinkronisasi: {pendingTxCount} transaksi,{" "}
                      {pendingDeleteCount} hapus
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
                      className="mt-2 rounded-xl bg-[var(--expense-bg)] px-3 py-2 font-bold text-[var(--expense-text)]"
                    >
                      Kendala sinkron: {sheetConnection.lastError}
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {!sheetConnection.connected ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleConnectGoogle}
                    className="min-h-[42px] flex-1 rounded-xl bg-[var(--brand-primary)] px-4 text-xs font-extrabold text-white hover:bg-[var(--brand-hover)] disabled:opacity-60"
                  >
                    Hubungkan &amp; Buat Google Sheets
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleDisconnectSheets}
                    className="min-h-[42px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 text-xs font-bold text-[var(--expense-text)]"
                  >
                    Putuskan Koneksi
                  </button>
                )}

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleSyncOrPreview(false)}
                  className="min-h-[42px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)] disabled:opacity-60"
                >
                  {sheetConnection.connected
                    ? "Sinkron Sekarang"
                    : "Pratinjau Tabel"}
                </button>

                {sheetConnection.connected && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleSyncOrPreview(true)}
                    className="min-h-[42px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 text-xs font-bold text-[var(--text-muted)] hover:bg-[var(--bg-soft)] disabled:opacity-60"
                  >
                    Sinkron Ulang
                  </button>
                )}
              </div>

              {previewRows && (
                <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2.5">
                  <table className="w-full text-left text-[11px] tabular-nums">
                    <tbody>
                      {previewRows.map((row, idx) => (
                        <tr
                          key={idx}
                          className={
                            idx === 0
                              ? "border-b border-[var(--border-subtle)] font-bold"
                              : ""
                          }
                        >
                          {row.slice(0, 6).map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className="whitespace-nowrap px-2 py-1"
                            >
                              {cIdx === 0 && idx > 0
                                ? `${cell.slice(0, 8)}...`
                                : cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {activeTab === "atur" && (
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5">
                <span className="mb-2 block text-xs font-bold text-[var(--text-primary)]">
                  Warna Tema Aplikasi
                </span>
                <ThemeDots
                  value={themeColor}
                  onChange={onChangeTheme}
                  showLabel={false}
                />
              </div>

              {!isDemoMode && (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5">
                  <div className="min-w-0">
                    <span className="block text-xs font-bold text-[var(--text-primary)]">
                      Pengingat Jadwal Rutin (PWA Push)
                    </span>
                    <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">
                      Kirim pengingat tiap pagi saat ada tagihan/gaji jatuh tempo.
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={pushBusy}
                    onClick={() => void handleTogglePush()}
                    className={`min-h-[38px] shrink-0 rounded-xl px-3.5 text-xs font-extrabold transition ${
                      pushSubscribed
                        ? "border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
                        : "bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)]"
                    } disabled:opacity-50`}
                  >
                    {pushBusy
                      ? "Memproses..."
                      : pushSubscribed
                        ? "Nonaktifkan"
                        : "Aktifkan"}
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="setting-budget"
                    className="mb-1 block text-xs font-bold text-[var(--text-muted)]"
                  >
                    Target Budget / Bulan
                  </label>
                  <input
                    id="setting-budget"
                    type="text"
                    inputMode="numeric"
                    value={(
                      parseInt(budgetText.replace(/\D/g, ""), 10) || 0
                    ).toLocaleString("id-ID")}
                    onChange={(e) =>
                      setBudgetText(e.target.value.replace(/\D/g, ""))
                    }
                    className="min-h-[40px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] tabular-nums"
                  />
                </div>
                <div>
                  <label
                    htmlFor="setting-payday"
                    className="mb-1 block text-xs font-bold text-[var(--text-muted)]"
                  >
                    Tanggal Gajian (1-31)
                  </label>
                  <input
                    id="setting-payday"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={31}
                    value={paydayDay}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      if (!raw) {
                        setPaydayDay("");
                        return;
                      }
                      const num = parseInt(raw, 10);
                      if (num >= 1 && num <= 31) {
                        setPaydayDay(String(num));
                      }
                    }}
                    className="min-h-[40px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] tabular-nums"
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
                    setPreset(
                      e.target.value as WorkspaceSettings["categoryPreset"],
                    )
                  }
                  className="min-h-[40px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)]"
                >
                  <option value="umum">Umum / Keluarga</option>
                  <option value="asn_karyawan">
                    ASN / Karyawan (Gaji, Tunjangan, Bonus, THR)
                  </option>
                  <option value="mahasiswa">
                    Mahasiswa (Uang Saku, Beasiswa)
                  </option>
                  <option value="freelancer">
                    Freelance (Proyek Klien, Retainer, Royalti)
                  </option>
                </select>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[var(--text-muted)]">
                    Dompet &amp; Saldo Awal (Rp)
                  </span>
                  <button
                    type="button"
                    onClick={() => setAddingAccount((v) => !v)}
                    className="text-xs font-bold text-[var(--brand-primary)] hover:underline dark:text-[#fda4af]"
                  >
                    {addingAccount ? "Tutup" : "+ Tambah Dompet"}
                  </button>
                </div>

                {addingAccount && (
                  <div className="mb-2.5 space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={newAccName}
                        onChange={(e) => setNewAccName(e.target.value)}
                        placeholder="Mis: BCA / GoPay / Kas"
                        className="min-h-[38px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 text-xs font-bold text-[var(--text-primary)]"
                      />
                      <select
                        value={newAccKind}
                        onChange={(e) =>
                          setNewAccKind(e.target.value as AccountKind)
                        }
                        aria-label="Jenis dompet"
                        className="min-h-[38px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 text-xs font-bold text-[var(--text-primary)]"
                      >
                        <option value="bank">Bank / Rekening</option>
                        <option value="ewallet">E-Wallet</option>
                        <option value="cash">Tunai / Kas</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={
                          newAccBalance
                            ? (
                                parseInt(
                                  newAccBalance.replace(/\D/g, ""),
                                  10,
                                ) || 0
                              ).toLocaleString("id-ID")
                            : ""
                        }
                        onChange={(e) =>
                          setNewAccBalance(e.target.value.replace(/\D/g, ""))
                        }
                        placeholder="Saldo awal (opsional, Rp 0)"
                        className="min-h-[38px] flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 text-xs font-bold text-[var(--text-primary)] tabular-nums"
                      />
                      <button
                        type="button"
                        disabled={busy || !newAccName.trim()}
                        onClick={handleAddAccountClick}
                        className="min-h-[38px] rounded-xl bg-[var(--brand-primary)] px-3.5 text-xs font-extrabold text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
                      >
                        Tambah
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {db.accounts.map((acc) => {
                    const raw =
                      initialBalances[acc.id] ??
                      String(acc.initialBalance || 0);
                    const numeric = parseInt(raw.replace(/\D/g, ""), 10) || 0;
                    return (
                      <div key={acc.id}>
                        <div className="mb-1 flex items-center justify-between gap-1">
                          <label
                            htmlFor={`init-bal-${acc.id}`}
                            className="truncate text-[11px] font-semibold text-[var(--text-muted)]"
                          >
                            {acc.name}
                          </label>
                          {db.accounts.length > 1 && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleDeleteAccountClick(acc.id)}
                              aria-label={`Hapus dompet ${acc.name}`}
                              className="shrink-0 text-[10px] font-bold text-[var(--expense-text)] hover:underline disabled:opacity-50"
                            >
                              Hapus
                            </button>
                          )}
                        </div>
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
                          className="min-h-[38px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 text-xs font-bold text-[var(--text-primary)] tabular-nums"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="min-h-[44px] w-full rounded-xl bg-[var(--brand-primary)] px-4 text-sm font-extrabold text-white hover:bg-[var(--brand-hover)] disabled:opacity-60"
              >
                {busy ? "Menyimpan..." : "Simpan Pengaturan"}
              </button>
            </form>
          )}

          {activeTab === "akun" && (
            <div className="space-y-4">
              <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
                      Status Akun
                    </h3>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {auth?.authenticated
                        ? `Masuk sebagai ${auth.email || "Pengguna"} · Paket ${db.settings.plan === "pro" ? "Pro" : `Gratis (Sisa AI: ${db.settings.aiCreditsRemaining ?? 20})`}`
                        : auth?.configured
                          ? "Mode Demo (tersimpan pribadi di browser ini)."
                          : "Penyimpanan lokal di perangkat ini."}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      auth?.authenticated
                        ? "bg-[var(--income-bg)] text-[var(--income-text)]"
                        : "bg-[var(--bg-soft)] text-[var(--brand-primary)] dark:text-[#fda4af]"
                    }`}
                  >
                    {auth?.authenticated ? "Aktif" : "Tamu"}
                  </span>
                </div>

                {auth?.configured && !auth?.authenticated && (
                  <form
                    onSubmit={handleSupabaseAuth}
                    className="mt-3 space-y-2.5"
                  >
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleSupabaseGoogleLogin}
                      className="flex min-h-[42px] w-full items-center justify-center gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3.5 text-xs font-extrabold text-[var(--text-primary)] hover:bg-[var(--bg-soft)] disabled:opacity-60"
                    >
                      <svg
                        className="h-4 w-4 shrink-0"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.74-.06-1.47-.19-2.18H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.06Z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                        />
                      </svg>
                      Lanjutkan dengan Akun Google
                    </button>

                    <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[var(--bg-card)] p-1 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode("login");
                          setAuthInfoMsg(null);
                        }}
                        className={`min-h-[34px] rounded-lg ${
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
                        className={`min-h-[34px] rounded-lg ${
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
                        placeholder="Password (min. 6)"
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        className="min-h-[40px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 text-xs font-bold text-[var(--text-primary)]"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                      <input
                        type="checkbox"
                        checked={migrateLocalOnAuth}
                        onChange={(e) =>
                          setMigrateLocalOnAuth(e.target.checked)
                        }
                        className="rounded"
                      />
                      <span>Ikut simpan catatan di perangkat ini</span>
                    </label>

                    {authInfoMsg && (
                      <p className="rounded-xl bg-[var(--bg-soft)] px-3 py-2 text-xs font-bold text-[var(--brand-primary)] dark:text-[#fda4af]">
                        {authInfoMsg}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={busy}
                      className="min-h-[40px] w-full rounded-xl bg-[var(--brand-primary)] px-4 text-xs font-bold text-white hover:bg-[var(--brand-hover)] disabled:opacity-60"
                    >
                      {authMode === "register"
                        ? "Daftar & Buat Akun"
                        : "Masuk ke Akun"}
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
                      Simpan Catatan Perangkat
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

              {/* <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4">
                <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
                  Impor Data CSV
                </h3>
                <label
                  htmlFor="legacy-csv-input"
                  className="mt-1.5 block text-xs font-bold text-[var(--text-muted)]"
                ></label>
                <textarea
                  id="legacy-csv-input"
                  rows={2}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder={
                    "Tanggal,Jenis,Nominal,Kategori,Keterangan\n16-11-2026,Keluar,25000,Makan & Minum,Nasi Padang"
                  }
                  className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5 text-xs text-[var(--text-primary)]"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleImportCsv}
                  className="mt-2 min-h-[38px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
                >
                  Impor Data
                </button>
              </section> */}

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
                    <span className="text-xs font-bold text-[var(--expense-text)]">
                      Yakin hapus semua?
                    </span>
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
          )}

          {errorMsg && (
            <p
              role="alert"
              className="rounded-xl bg-[var(--expense-bg)] px-3 py-2 text-xs font-bold text-[var(--expense-text)]"
            >
              {errorMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
