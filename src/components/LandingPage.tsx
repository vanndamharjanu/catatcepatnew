"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { formatRupiah, toIsoDate } from "@/lib/finance";
import type { AppDatabase } from "@/lib/types";
import { MicIcon, ScaleIcon, SheetIcon, ThemeIcon } from "./Icons";
import { OctopusMascot } from "./OctopusMascot";

interface LandingPageProps {
  db: AppDatabase;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onAuthSuccess: (nextDb: AppDatabase, message: string) => void;
  onEnterDemo: () => void;
  initialError?: string | null;
}

const SAMPLE_BUDGETS = [
  { label: "Rp 3.000.000", budget: 3_000_000, spent: 1_150_000, daysLeft: 12 },
  { label: "Rp 5.000.000", budget: 5_000_000, spent: 1_800_000, daysLeft: 12 },
  { label: "Rp 8.000.000", budget: 8_000_000, spent: 2_600_000, daysLeft: 12 },
];

const CHAT_EXAMPLES = [
  {
    id: "kopi",
    label: "Jajan & Parkir",
    prompt: "Ngopi 25rb pake ewallet, parkir 2rb tunai",
    rows: [
      { category: "Makanan", note: "Ngopi", account: "E-Wallet", type: "Keluar" as const, amount: 25_000 },
      { category: "Transportasi", note: "Parkir", account: "Tunai", type: "Keluar" as const, amount: 2_000 },
    ],
  },
  {
    id: "gaji",
    label: "Gaji Masuk",
    prompt: "Gajian 5,2 juta masuk rekening bank",
    rows: [
      { category: "Gaji", note: "Gajian", account: "Rekening Bank", type: "Masuk" as const, amount: 5_200_000 },
    ],
  },
  {
    id: "belanja",
    label: "Belanja Harian",
    prompt: "Belanja kebutuhan rumah 145rb qris",
    rows: [
      { category: "Kebutuhan Sehari-hari", note: "Belanja kebutuhan rumah", account: "E-Wallet", type: "Keluar" as const, amount: 145_000 },
    ],
  },
];

export function LandingPage({
  db,
  darkMode,
  onToggleDarkMode,
  onAuthSuccess,
  onEnterDemo,
  initialError,
}: LandingPageProps) {
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [migrateLocal, setMigrateLocal] = useState(true);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError || null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [sampleIdx, setSampleIdx] = useState(0);
  const [chatExampleIdx, setChatExampleIdx] = useState(0);

  const emailInputRef = useRef<HTMLInputElement>(null);

  const activeSample = SAMPLE_BUDGETS[sampleIdx] ?? SAMPLE_BUDGETS[0];
  const sampleRemaining = Math.max(0, activeSample.budget - activeSample.spent);
  const sampleDailyAllowance = Math.floor(sampleRemaining / activeSample.daysLeft);
  const activeChatExample = CHAT_EXAMPLES[chatExampleIdx] ?? CHAT_EXAMPLES[0];
  const todayIso = toIsoDate();

  const handleFocusLogin = () => {
    emailInputRef.current?.focus();
    emailInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleGoogleLogin = async () => {
    setGoogleBusy(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      const res = await fetch("/api/auth?provider=google");
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Gagal memulai login Google.");
      }
      window.location.href = data.url;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal memulai login Google.");
      setGoogleBusy(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: authMode,
          email,
          password,
          migrateLocal,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        state?: AppDatabase;
        needsEmailConfirmation?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Gagal memproses autentikasi.");
      }
      if (data.needsEmailConfirmation) {
        setInfoMsg(
          data.message ||
            "Pendaftaran berhasil. Silakan cek kotak masuk email Anda untuk verifikasi.",
        );
        return;
      }
      if (data.state) {
        onAuthSuccess(
          data.state,
          authMode === "register"
            ? "Workspace Cloud berhasil dibuat."
            : `Selamat datang kembali, ${data.state.auth?.email || email}.`,
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal masuk ke akun.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh w-full overflow-x-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-card)]/95 px-4 py-3 backdrop-blur-sm sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand-primary)] text-white">
              <OctopusMascot mood="saving" size={34} />
            </div>
            <div className="min-w-0">
              <span className="block truncate text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                CatatCepat
              </span>
              <span className="block truncate text-xs text-[var(--text-muted)]">
                catatcepat.web.id
              </span>
            </div>
          </div>

          <nav
            aria-label="Navigasi landing page"
            className="hidden items-center gap-5 text-xs font-bold text-[var(--text-muted)] md:flex"
          >
            <a href="#cara-catat" className="hover:text-[var(--text-primary)]">
              Catat AI
            </a>
            <a href="#jatah-harian" className="hover:text-[var(--text-primary)]">
              Jatah Harian
            </a>
            <a href="#sheets" className="hover:text-[var(--text-primary)]">
              Google Sheets
            </a>
            <Link href="/privacy" className="hover:text-[var(--text-primary)]">
              Privasi
            </Link>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onToggleDarkMode}
              aria-label={darkMode ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
            >
              <ThemeIcon dark={darkMode} className="h-4 w-4" />
              <span className="ml-1.5 hidden sm:inline">
                {darkMode ? "Terang" : "Gelap"}
              </span>
            </button>

            <button
              type="button"
              onClick={onEnterDemo}
              className="min-h-[44px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
            >
              Buka Demo
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 lg:py-12">
        <section className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-10">
          <div className="min-w-0 space-y-6 lg:col-span-7">
            <div className="space-y-3">
              <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl sm:leading-tight">
                Tahu sisa jatah belanja hari ini sebelum gaji habis di tengah bulan.
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
                Catat pemasukan dan pengeluaran di Tunai, Rekening Bank, dan E-Wallet lewat suara,
                kalimat singkat, atau foto struk. Data tersimpan aman di akun Cloud Anda dan dapat
                disinkronkan langsung ke Google Sheets pribadi.
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1 text-xs font-semibold text-[var(--text-muted)]">
                <span>Dibuka dari HP atau laptop</span>
                <span>·</span>
                <span>Tanpa instal aplikasi</span>
                <span>·</span>
                <span>Data milik Anda di Google Sheets</span>
              </div>
            </div>

            {/* Interactive AI Input Preview Card (focused clarity inspired by modern ledger UX) */}
            <div
              id="cara-catat"
              className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-soft)] text-[var(--brand-primary)] dark:text-[#fda4af]">
                    <MicIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-extrabold text-[var(--text-primary)]">
                      Contoh Catat AI: Ketik, Suara, atau Foto Struk
                    </h2>
                    <p className="text-xs text-[var(--text-muted)]">
                      Pilih salah satu contoh kalimat di bawah untuk melihat hasil draf otomatisnya:
                    </p>
                  </div>
                </div>
              </div>

              <div
                role="group"
                aria-label="Pilih contoh kalimat transaksi"
                className="mt-3.5 flex flex-wrap gap-2"
              >
                {CHAT_EXAMPLES.map((ex, idx) => (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => setChatExampleIdx(idx)}
                    aria-pressed={chatExampleIdx === idx}
                    className={`min-h-[44px] rounded-xl px-3.5 text-xs font-bold transition-colors ${
                      chatExampleIdx === idx
                        ? "bg-[var(--brand-primary)] text-white"
                        : "border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
                    }`}
                  >
                    {ex.label}
                  </button>
                ))}
              </div>

              <div className="mt-3.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5">
                <span className="block text-[11px] font-bold text-[var(--text-muted)]">
                  Input Anda:
                </span>
                <p className="mt-1 text-sm font-extrabold text-[var(--text-primary)]">
                  &ldquo;{activeChatExample.prompt}&rdquo;
                </p>

                <div className="mt-3 space-y-2 border-t border-[var(--border-subtle)] pt-3">
                  {activeChatExample.rows.map((row) => (
                    <div
                      key={`${row.category}-${row.note}`}
                      className="flex items-center justify-between gap-3 rounded-xl bg-[var(--bg-card)] px-3 py-2.5 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="block truncate font-extrabold text-[var(--text-primary)]">
                          {row.note}
                        </span>
                        <span className="block text-[11px] text-[var(--text-muted)]">
                          {row.category} · {row.account}
                        </span>
                      </div>
                      <strong
                        className={`shrink-0 whitespace-nowrap tabular-nums ${
                          row.type === "Masuk"
                            ? "text-[var(--income-text)]"
                            : "text-[var(--expense-text)]"
                        }`}
                      >
                        {row.type === "Masuk" ? "+" : "-"}
                        {formatRupiah(row.amount)}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-soft)] text-[var(--brand-primary)] dark:text-[#fda4af]">
                  <ScaleIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
                    Koreksi Saldo Dompet &amp; Tanya Guri
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Cocokkan saldo Tunai, Bank, dan E-Wallet dengan uang nyata dalam 1 klik, atau tanyakan kategori paling boros langsung ke asisten Guri.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div id="masuk" className="min-w-0 lg:col-span-5">
            <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 shadow-md">
              <h2 className="text-lg font-extrabold text-[var(--text-primary)]">
                Masuk atau Buat Akun CatatCepat
              </h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Data keuangan Anda tersimpan terpisah per akun dengan isolasi Row-Level Security (RLS).
              </p>

              <div className="mt-4">
                <button
                  type="button"
                  disabled={busy || googleBusy}
                  onClick={handleGoogleLogin}
                  className="flex min-h-[46px] w-full items-center justify-center gap-2.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 text-xs font-extrabold text-[var(--text-primary)] hover:bg-[var(--bg-soft)] disabled:opacity-60"
                >
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
                  <span>
                    {googleBusy ? "Mengarahkan ke Google..." : "Lanjutkan dengan Akun Google"}
                  </span>
                </button>
              </div>

              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-[var(--border-subtle)]" />
                <span className="text-[11px] font-bold text-[var(--text-muted)]">
                  atau gunakan email
                </span>
                <div className="h-px flex-1 bg-[var(--border-subtle)]" />
              </div>

              <div
                role="tablist"
                aria-label="Pilih mode masuk atau daftar"
                className="flex gap-1.5 rounded-xl bg-[var(--bg-canvas)] p-1 text-xs font-bold"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={authMode === "login"}
                  onClick={() => {
                    setAuthMode("login");
                    setErrorMsg(null);
                    setInfoMsg(null);
                  }}
                  className={`min-h-[44px] flex-1 rounded-lg transition-colors ${
                    authMode === "login"
                      ? "bg-[var(--brand-primary)] text-white"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Masuk Akun
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={authMode === "register"}
                  onClick={() => {
                    setAuthMode("register");
                    setErrorMsg(null);
                    setInfoMsg(null);
                  }}
                  className={`min-h-[44px] flex-1 rounded-lg transition-colors ${
                    authMode === "register"
                      ? "bg-[var(--brand-primary)] text-white"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Daftar Baru
                </button>
              </div>

              <form onSubmit={handleEmailSubmit} className="mt-4 space-y-3.5">
                <div>
                  <label
                    htmlFor="landing-auth-email"
                    className="mb-1 block text-xs font-bold text-[var(--text-primary)]"
                  >
                    Alamat Email
                  </label>
                  <input
                    ref={emailInputRef}
                    id="landing-auth-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="nama@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="min-h-[44px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 text-sm font-semibold text-[var(--text-primary)]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="landing-auth-password"
                    className="mb-1 block text-xs font-bold text-[var(--text-primary)]"
                  >
                    Password
                  </label>
                  <input
                    id="landing-auth-password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete={authMode === "register" ? "new-password" : "current-password"}
                    placeholder="Minimal 6 karakter"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="min-h-[44px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 text-sm font-semibold text-[var(--text-primary)]"
                  />
                </div>

                {db.transactions.length > 0 && (
                  <label
                    htmlFor="landing-migrate-local"
                    className="flex min-h-[44px] items-center gap-2.5 rounded-xl bg-[var(--bg-canvas)] px-3 py-2 text-xs text-[var(--text-muted)]"
                  >
                    <input
                      id="landing-migrate-local"
                      type="checkbox"
                      checked={migrateLocal}
                      onChange={(e) => setMigrateLocal(e.target.checked)}
                      className="h-4 w-4 rounded"
                    />
                    <span>
                      Bawa {db.transactions.length} transaksi lokal yang ada ke akun Cloud saya
                    </span>
                  </label>
                )}

                {errorMsg && (
                  <p
                    role="alert"
                    className="rounded-xl border border-[var(--expense-text)]/30 bg-[var(--expense-bg)] px-3.5 py-2.5 text-xs font-bold text-[var(--expense-text)]"
                  >
                    {errorMsg}
                  </p>
                )}

                {infoMsg && (
                  <p
                    role="status"
                    className="rounded-xl border border-[var(--income-text)]/30 bg-[var(--income-bg)] px-3.5 py-2.5 text-xs font-bold text-[var(--income-text)]"
                  >
                    {infoMsg}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy || googleBusy}
                  className="min-h-[46px] w-full rounded-2xl bg-[var(--brand-primary)] px-4 text-sm font-extrabold text-white hover:bg-[var(--brand-hover)] disabled:opacity-60"
                >
                  {busy
                    ? "Memproses..."
                    : authMode === "register"
                      ? "Buat Workspace Baru"
                      : "Masuk ke Workspace"}
                </button>
              </form>

              <p className="mt-3 text-center text-[11px] leading-relaxed text-[var(--text-muted)]">
                Dengan masuk, Anda menyetujui{" "}
                <Link href="/terms" className="font-bold text-[var(--text-primary)] underline">
                  Ketentuan Layanan
                </Link>{" "}
                dan{" "}
                <Link href="/privacy" className="font-bold text-[var(--text-primary)] underline">
                  Kebijakan Privasi
                </Link>
                .
              </p>

              <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
                <button
                  type="button"
                  onClick={onEnterDemo}
                  className="min-h-[44px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 text-xs font-extrabold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
                >
                  Buka Mode Demo Tanpa Daftar
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Daily Allowance Simulator + Guri Companion */}
        <section
          id="jatah-harian"
          className="mt-10 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
            <div className="flex min-w-0 items-center gap-3.5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--bg-soft)]">
                <OctopusMascot mood="saving" size={48} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-extrabold text-[var(--text-primary)]">
                  Simulasi Hitungan Jatah Harian Guri
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Pilih contoh target anggaran siklus gajian untuk melihat pembagian harian otomatis:
                </p>
              </div>
            </div>

            <div
              role="group"
              aria-label="Pilih contoh target anggaran"
              className="flex flex-wrap gap-1.5"
            >
              {SAMPLE_BUDGETS.map((item, idx) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setSampleIdx(idx)}
                  aria-pressed={sampleIdx === idx}
                  className={`min-h-[44px] rounded-xl px-3.5 text-xs font-bold tabular-nums transition-colors ${
                    sampleIdx === idx
                      ? "bg-[var(--brand-primary)] text-white"
                      : "border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 tabular-nums">
            <div className="rounded-2xl bg-[var(--bg-canvas)] p-4">
              <span className="block text-xs font-semibold text-[var(--text-muted)]">
                Terpakai di Siklus Ini
              </span>
              <strong className="mt-1 block text-lg font-extrabold text-[var(--text-primary)]">
                {formatRupiah(activeSample.spent)}
              </strong>
            </div>
            <div className="rounded-2xl bg-[var(--bg-canvas)] p-4">
              <span className="block text-xs font-semibold text-[var(--text-muted)]">
                Sisa Anggaran ({activeSample.daysLeft} hari)
              </span>
              <strong className="mt-1 block text-lg font-extrabold text-[var(--text-primary)]">
                {formatRupiah(sampleRemaining)}
              </strong>
            </div>
            <div className="hero-maroon-gradient rounded-2xl p-4 text-white">
              <span className="block text-xs font-semibold text-white/90">
                Jatah Aman Hari Ini
              </span>
              <strong className="mt-1 block text-xl font-extrabold">
                {formatRupiah(sampleDailyAllowance)}
              </strong>
            </div>
          </div>

          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Jika hari ini pengeluaran Anda di bawah {formatRupiah(sampleDailyAllowance)}, sisa
            uangnya otomatis menambah jatah harian besok dan menjaga streak harian Guri.
          </p>
        </section>

        {/* Full-Width Section: Real 8-Column Google Sheets Sync Structure */}
        <section
          id="sheets"
          className="mt-8 w-full min-w-0 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-2xl flex-1">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-soft)] text-[var(--brand-primary)] dark:text-[#fda4af]">
                  <SheetIcon className="h-5 w-5" />
                </span>
                <h2 className="text-base font-extrabold text-[var(--text-primary)]">
                  Data Tetap Milik Anda di Google Sheets Pribadi
                </h2>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)] sm:text-sm">
                CatatCepat membuat 1 file spreadsheet langsung di Google Drive Anda memakai izin
                terbatas{" "}
                <code className="rounded bg-[var(--bg-soft)] px-1.5 py-0.5 font-bold text-[var(--text-primary)]">
                  drive.file
                </code>{" "}
                (tidak pernah membaca atau mengakses file Drive pribadi Anda yang lain). Setiap baris
                dikunci memakai <strong>Transaction ID (UUID)</strong> agar edit atau hapus transaksi
                tetap akurat tanpa menimpa sheet atau rumus tambahan Anda.
              </p>
            </div>

            <button
              type="button"
              onClick={handleFocusLogin}
              className="min-h-[44px] shrink-0 rounded-xl bg-[var(--bg-soft)] px-4 text-xs font-extrabold text-[var(--brand-primary)] hover:bg-[var(--bg-soft-hover)] dark:text-[#fda4af]"
            >
              Mulai Hubungkan Akun
            </button>
          </div>

          <div className="mt-4 w-full max-w-full overflow-x-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3">
            <table className="w-full text-left text-xs tabular-nums">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] font-extrabold text-[var(--text-primary)]">
                  <th className="whitespace-nowrap px-2.5 py-2">Transaction ID</th>
                  <th className="whitespace-nowrap px-2.5 py-2">Tanggal</th>
                  <th className="whitespace-nowrap px-2.5 py-2">Jenis</th>
                  <th className="whitespace-nowrap px-2.5 py-2">Kategori</th>
                  <th className="whitespace-nowrap px-2.5 py-2">Akun</th>
                  <th className="whitespace-nowrap px-2.5 py-2">Nominal</th>
                  <th className="whitespace-nowrap px-2.5 py-2">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-muted)]">
                <tr>
                  <td className="whitespace-nowrap px-2.5 py-2 font-mono text-[11px]">9c20ed42...</td>
                  <td className="whitespace-nowrap px-2.5 py-2">{todayIso}</td>
                  <td className="whitespace-nowrap px-2.5 py-2 font-bold text-[var(--income-text)]">Masuk</td>
                  <td className="whitespace-nowrap px-2.5 py-2">Gaji</td>
                  <td className="whitespace-nowrap px-2.5 py-2">Rekening Bank</td>
                  <td className="whitespace-nowrap px-2.5 py-2 font-bold text-[var(--text-primary)]">5200000</td>
                  <td className="whitespace-nowrap px-2.5 py-2">Gaji bulanan</td>
                </tr>
                <tr>
                  <td className="whitespace-nowrap px-2.5 py-2 font-mono text-[11px]">4f18ab19...</td>
                  <td className="whitespace-nowrap px-2.5 py-2">{todayIso}</td>
                  <td className="whitespace-nowrap px-2.5 py-2 font-bold text-[var(--expense-text)]">Keluar</td>
                  <td className="whitespace-nowrap px-2.5 py-2">Makanan</td>
                  <td className="whitespace-nowrap px-2.5 py-2">E-Wallet</td>
                  <td className="whitespace-nowrap px-2.5 py-2 font-bold text-[var(--text-primary)]">28000</td>
                  <td className="whitespace-nowrap px-2.5 py-2">Makan siang QRIS</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-6 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 text-xs text-[var(--text-muted)]">
          <div>
            <span className="font-extrabold text-[var(--text-primary)]">CatatCepat</span>
            <span className="mx-2">·</span>
            <span>Buku kas harian &amp; sinkronisasi Google Sheets (catatcepat.web.id)</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 font-bold">
            <Link href="/privacy" className="py-1 text-[var(--text-primary)] hover:underline">
              Kebijakan Privasi
            </Link>
            <Link href="/terms" className="py-1 text-[var(--text-primary)] hover:underline">
              Ketentuan Layanan
            </Link>
            <a
              href="mailto:vanndamharjanu@gmail.com"
              className="py-1 text-[var(--text-primary)] hover:underline"
            >
              Kontak
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
