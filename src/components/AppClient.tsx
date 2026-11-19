"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  answerFinancialQuestion,
  computeAccountBalances,
  computeDailyAllowance,
  computePeriodMetrics,
  computeStreak,
  formatDisplayDate,
  formatRupiah,
  toIsoDate,
  type TimeRangeKey,
} from "@/lib/finance";
import {
  buildDemoSampleTransactions,
  escapeCsvCell,
  loadDemoDb,
  loadOfflineQueue,
  loadWorkspaceExtras,
  recomputeGoalsClient,
  saveDemoDb,
  saveOfflineQueue,
  saveWorkspaceExtras,
  type QueuedTransactionPayload,
  type WorkspaceExtras,
} from "@/lib/client-demo";
import {
  APP_SLOGAN,
  THEME_OPTIONS,
  type AccountKind,
  type AppDatabase,
  type ParsedTransactionDraft,
  type RecurringTemplate,
  type ThemeKey,
  type Transaction,
  type TransactionType,
  type WorkspaceSettings,
} from "@/lib/types";
import { KoreksiSaldoModal } from "./AccountCarousel";
import { GoalsTab } from "./tabs/GoalsTab";
import { HistoryTab } from "./tabs/HistoryTab";
import { StatsTab } from "./tabs/StatsTab";
import {
  CategoryIcon,
  ChartIcon,
  CloseIcon,
  EyeIcon,
  HomeIcon,
  ListIcon,
  PlusIcon,
  SavingsIcon,
  ScaleIcon,
  SheetIcon,
  ThemeIcon,
  TransferIcon,
} from "./Icons";
import { OctopusMascot, type GuriMood } from "./OctopusMascot";
import { LandingPage } from "./LandingPage";
import { SheetsDrawer, type SettingsTabKey } from "./SheetsDrawer";
import { ThemeDots } from "./ThemeDots";
import { TransactionForm, TransactionSheet } from "./TransactionSheet";

type NavTab = "beranda" | "riwayat" | "tabungan" | "statistik";

interface AppClientProps {
  initialDb: AppDatabase;
}

export function AppClient({ initialDb }: AppClientProps) {
  const [db, setDb] = useState<AppDatabase>(initialDb);
  const [activeTab, setActiveTab] = useState<NavTab>("beranda");
  const [timeRange, setTimeRange] = useState<TimeRangeKey>("month");
  const [hideNumbers, setHideNumbers] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [themeColor, setThemeColor] = useState<ThemeKey>("maroon");
  const [demoBypass, setDemoBypass] = useState(false);
  const [sheetPromptDismissed, setSheetPromptDismissed] = useState(false);
  const [quickSheetBusy, setQuickSheetBusy] = useState(false);

  // Modals & sheets
  const [txSheetOpen, setTxSheetOpen] = useState(false);
  const [txSheetInitialTab, setTxSheetInitialTab] = useState<"manual" | "ai">(
    "manual",
  );
  const [txSheetInitialType, setTxSheetInitialType] =
    useState<TransactionType>("Keluar");
  const [txSheetInitialAccountId, setTxSheetInitialAccountId] = useState<
    string | undefined
  >(undefined);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reconcileAccountId, setReconcileAccountId] = useState<
    string | undefined
  >(undefined);
  const [sheetsOpen, setSheetsOpen] = useState(false);
  const [sheetsInitialTab, setSheetsInitialTab] =
    useState<SettingsTabKey>("sheets");
  const [formulaModalOpen, setFormulaModalOpen] = useState(false);

  // Saving goal modals
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalName, setGoalName] = useState("");
  const [goalTargetRaw, setGoalTargetRaw] = useState("");
  const [depositModalGoalId, setDepositModalGoalId] = useState<string | null>(
    null,
  );
  const [depositRaw, setDepositRaw] = useState("");
  const [depositAccountId, setDepositAccountId] = useState(
    initialDb.accounts[0]?.id || "acc-cash",
  );
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    setModalError(null);
  }, [goalModalOpen, depositModalGoalId]);

  // Riwayat filters (YYYY-MM | "all" | "custom")
  const todayMonth = toIsoDate().slice(0, 7);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMonth, setFilterMonth] = useState<string>(todayMonth);
  const [riwayatStartDate, setRiwayatStartDate] = useState<string>(
    `${todayMonth}-01`,
  );
  const [riwayatEndDate, setRiwayatEndDate] = useState<string>(toIsoDate());
  const [filterType, setFilterType] = useState<"all" | TransactionType>("all");
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [confirmDeleteTxId, setConfirmDeleteTxId] = useState<string | null>(
    null,
  );

  // Statistik filters (YYYY-MM | "all" | "custom")
  const [statFilterMode, setStatFilterMode] = useState<string>(todayMonth);
  const [statStartDate, setStatStartDate] = useState<string>(
    `${todayMonth}-01`,
  );
  const [statEndDate, setStatEndDate] = useState<string>(toIsoDate());

  // Tanya Guri Q&A
  const [askInput, setAskInput] = useState("");
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askLoading, setAskLoading] = useState(false);

  // Global status toast / error banner + offline queue & workspace extras
  const [toast, setToast] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [loadingMoreTx, setLoadingMoreTx] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<QueuedTransactionPayload[]>(
    [],
  );
  const [extras, setExtras] = useState<WorkspaceExtras>({
    recurring: [],
    categoryBudgets: {},
  });
  const [recName, setRecName] = useState("");
  const [recType, setRecType] = useState<"Masuk" | "Keluar">("Keluar");
  const [recCategory, setRecCategory] = useState("Listrik & Air");
  const [recAccountId, setRecAccountId] = useState(
    initialDb.accounts[0]?.id || "acc-cash",
  );
  const [recAmountRaw, setRecAmountRaw] = useState("");
  const [recDay, setRecDay] = useState("1");
  const [budgetCatName, setBudgetCatName] = useState("Makan & Minum");
  const [budgetCatCapRaw, setBudgetCatCapRaw] = useState("");

  const isDemoMode = Boolean(db.auth?.configured && !db.auth?.authenticated);
  const extrasScopeKey = db.auth?.userId || "demo";

  const mutateDemoDb = useCallback(
    (updater: (prev: AppDatabase) => AppDatabase) => {
      setDb((prev) => {
        const next = recomputeGoalsClient(updater(prev));
        saveDemoDb(next);
        return next;
      });
    },
    [],
  );

  const updateExtras = useCallback(
    (updater: (prev: WorkspaceExtras) => WorkspaceExtras) => {
      setExtras((prev) => {
        const next = updater(prev);
        saveWorkspaceExtras(extrasScopeKey, next);
        return next;
      });
    },
    [extrasScopeKey],
  );

  // Serialized non-blocking background sync to Google Sheets
  const syncInFlightRef = useRef(false);
  const syncQueuedModeRef = useRef<"none" | "incremental" | "full">("none");

  const triggerBackgroundSync = useCallback(async (full = false) => {
    if (syncInFlightRef.current) {
      if (full || syncQueuedModeRef.current === "none") {
        syncQueuedModeRef.current = full ? "full" : "incremental";
      }
      return;
    }

    syncInFlightRef.current = true;
    try {
      const res = await fetch("/api/sheets/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        state?: AppDatabase;
      };
      if (data.state) {
        setDb(data.state);
      }
    } catch {
      // Transient network errors stay queued as sheetSyncStatus="pending" / pendingDeletes.
    } finally {
      syncInFlightRef.current = false;
      const queuedMode = syncQueuedModeRef.current;
      if (queuedMode !== "none") {
        syncQueuedModeRef.current = "none";
        void triggerBackgroundSync(queuedMode === "full");
      }
    }
  }, []);

  const applyDbState = (
    next: AppDatabase,
    syncMode: "incremental" | "full" = "incremental",
  ) => {
    setDb(next);
    if (next.sheetConnection.connected) {
      void triggerBackgroundSync(syncMode === "full");
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
  };

  const handleLoadMoreTransactions = async () => {
    if (isDemoMode || loadingMoreTx || !db.hasMoreTransactions) return;
    setLoadingMoreTx(true);
    try {
      const res = await fetch(
        `/api/transactions?offset=${db.transactions.length}&limit=500`,
      );
      const data = (await res.json()) as {
        transactions?: Transaction[];
        hasMore?: boolean;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Gagal memuat arsip transaksi.");
      }
      const incoming = data.transactions || [];
      setDb((prev) => {
        const seen = new Set(prev.transactions.map((t) => t.id));
        const merged = [
          ...prev.transactions,
          ...incoming.filter((t) => !seen.has(t.id)),
        ];
        return {
          ...prev,
          transactions: merged,
          hasMoreTransactions: Boolean(data.hasMore),
        };
      });
      if (incoming.length > 0) {
        showToast(`${incoming.length} arsip transaksi lama dimuat.`);
      }
    } catch (err) {
      setGlobalError(
        err instanceof Error ? err.message : "Gagal memuat arsip transaksi.",
      );
    } finally {
      setLoadingMoreTx(false);
    }
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Initialize persisted theme & color preferences safely
  useEffect(() => {
    const saved = localStorage.getItem("catatcepat_dark");
    if (saved === "1") {
      setDarkMode(true);
      document.documentElement.classList.add("dark");
    }
    const savedTheme = localStorage.getItem(
      "catatcepat_theme",
    ) as ThemeKey | null;
    if (savedTheme && THEME_OPTIONS.some((t) => t.key === savedTheme)) {
      setThemeColor(savedTheme);
      document.documentElement.dataset.theme = savedTheme;
    }
    if (localStorage.getItem("catatcepat_sheet_prompt_dismissed") === "1") {
      setSheetPromptDismissed(true);
    }
    const params = new URLSearchParams(window.location.search);
    const sheetsParam = params.get("sheets");
    if (sheetsParam === "connected") {
      showToast("Google Sheets berhasil dihubungkan dan disinkronkan.");
      window.history.replaceState({}, "", "/");
    } else if (sheetsParam === "auth_required") {
      setGlobalError(
        "Sesi login Anda berakhir. Silakan masuk ulang sebelum menghubungkan Google Sheets.",
      );
      window.history.replaceState({}, "", "/");
    } else if (sheetsParam === "error") {
      setGlobalError(
        db.sheetConnection.lastError ||
          "Gagal menghubungkan Google Sheets. Silakan coba hubungkan kembali.",
      );
      window.history.replaceState({}, "", "/");
    }

    if ("serviceWorker" in navigator && window.location.protocol === "https:") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    setIsOffline(!navigator.onLine);
    setOfflineQueue(loadOfflineQueue());
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const authCode = params.get("code");
    const queryErrorDesc =
      params.get("error_description") || params.get("error");
    if (authCode) {
      window.history.replaceState({}, "", window.location.pathname);
      void fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "exchange_pkce_code",
          code: authCode,
        }),
      })
        .then((r) => r.json())
        .then((data: { state?: AppDatabase; error?: string }) => {
          if (data.state) {
            setDb(data.state);
            showToast(
              `Masuk dengan Google sebagai ${data.state.auth?.email || "User"}.`,
            );
          } else if (data.error) {
            setGlobalError(data.error);
          }
        })
        .catch(() => {
          setGlobalError("Gagal menukar kode login Google (PKCE).");
        });
    } else if (queryErrorDesc && !sheetsParam) {
      window.history.replaceState({}, "", window.location.pathname);
      setGlobalError(
        `Login Google belum berhasil (${queryErrorDesc.replace(/\+/g, " ")}). Silakan coba lagi atau masuk dengan email.`,
      );
    }

    if (window.location.hash.length > 1) {
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token") || "";
      const errorDesc =
        hashParams.get("error_description") || hashParams.get("error");
      if (accessToken) {
        window.history.replaceState({}, "", window.location.pathname);
        void fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "session_from_tokens",
            accessToken,
            refreshToken,
          }),
        })
          .then((r) => r.json())
          .then((data: { state?: AppDatabase; error?: string }) => {
            if (data.state) {
              setDb(data.state);
              showToast(
                `Masuk dengan Google sebagai ${data.state.auth?.email || "User"}.`,
              );
            } else if (data.error) {
              setGlobalError(data.error);
            }
          })
          .catch(() => {
            setGlobalError("Gagal menyimpan sesi login Google.");
          });
      } else if (errorDesc) {
        window.history.replaceState({}, "", window.location.pathname);
        setGlobalError(
          `Login Google belum berhasil (${errorDesc.replace(/\+/g, " ")}). Silakan coba lagi atau masuk dengan email.`,
        );
      }
    }
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    setExtras(loadWorkspaceExtras(extrasScopeKey));
  }, [extrasScopeKey]);

  // Keep server-side push_subscriptions.recurring_json in sync when subscribed
  useEffect(() => {
    if (isDemoMode) return;
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!sub) return;
        return fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: sub.toJSON(),
            recurring: extras.recurring,
          }),
        });
      })
      .catch(() => {});
  }, [extras.recurring, isDemoMode]);

  // Sync mobile PWA status bar & gesture bar color with active theme/dark mode
  useEffect(() => {
    const surfaceColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--bg-card")
        .trim() || (darkMode ? "#221117" : "#ffffff");
    const metas = document.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (metas.length > 0) {
      metas.forEach((m) => {
        m.content = surfaceColor;
      });
    } else {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = surfaceColor;
      document.head.appendChild(meta);
    }
  }, [darkMode, themeColor]);

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("catatcepat_dark", next ? "1" : "0");
      return next;
    });
  };

  const handleChangeTheme = (next: ThemeKey) => {
    setThemeColor(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("catatcepat_theme", next);
  };

  const openSheetsTab = (tab: SettingsTabKey) => {
    setSheetsInitialTab(tab);
    setSheetsOpen(true);
  };

  const handleQuickConnectSheets = async () => {
    setQuickSheetBusy(true);
    setGlobalError(null);
    try {
      const res = await fetch("/api/sheets/connect");
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Koneksi Google Sheets belum tersedia.");
      }
      window.location.href = data.url;
    } catch (err) {
      setGlobalError(
        err instanceof Error
          ? err.message
          : "Gagal menghubungkan Google Sheets.",
      );
      setQuickSheetBusy(false);
    }
  };

  const dismissSheetPrompt = () => {
    setSheetPromptDismissed(true);
    localStorage.setItem("catatcepat_sheet_prompt_dismissed", "1");
  };

  // Escape handler for inline dialogs
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (formulaModalOpen) setFormulaModalOpen(false);
      if (goalModalOpen) setGoalModalOpen(false);
      if (depositModalGoalId) setDepositModalGoalId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [formulaModalOpen, goalModalOpen, depositModalGoalId]);

  const metrics = useMemo(
    () => computePeriodMetrics(db.transactions, timeRange),
    [db.transactions, timeRange],
  );
  const allowance = useMemo(
    () =>
      computeDailyAllowance(
        db.transactions,
        db.settings.monthlyBudget,
        db.settings.paydayDay,
      ),
    [db.transactions, db.settings.monthlyBudget, db.settings.paydayDay],
  );
  const streak = useMemo(
    () => computeStreak(db.transactions),
    [db.transactions],
  );
  const accountBalances = useMemo(
    () => computeAccountBalances(db.accounts, db.transactions),
    [db.accounts, db.transactions],
  );
  const accountBalanceMap = useMemo(
    () =>
      Object.fromEntries(accountBalances.map((acc) => [acc.id, acc.balance])),
    [accountBalances],
  );
  const totalAssets = useMemo(
    () => accountBalances.reduce((sum, acc) => sum + acc.balance, 0),
    [accountBalances],
  );
  const hasNegativeBalance = accountBalances.some((acc) => acc.balance < 0);
  const categoryUsageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tx of db.transactions) {
      if (tx.type === "Keluar" || tx.type === "Masuk") {
        const key = `${tx.type}:${tx.category}`;
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    return counts;
  }, [db.transactions]);

  // Mood and helpful message for Guri mascot
  const guriState = useMemo((): { mood: GuriMood; message: string } => {
    if (db.transactions.length === 0) {
      return {
        mood: "empty",
        message:
          "Guri siap menemani catatanmu. Mulai dari pengeluaran kecil hari ini.",
      };
    }
    if (allowance.budgetUtilizationPct >= 85 || allowance.remainingToday < 0) {
      return {
        mood: "careful",
        message: `Budget siklus terpakai ${allowance.budgetUtilizationPct}%. Hari ini rem dulu belanja non-primer.`,
      };
    }
    return {
      mood: "saving",
      message:
        allowance.remainingToday > 0
          ? `Jatah hari ini masih aman ${hideNumbers ? "Rp ***" : formatRupiah(allowance.remainingToday)}. Lanjutkan ritme hematmu.`
          : "Jatah hari ini pas di batas. Tahan pengeluaran tambahan sampai besok.",
    };
  }, [db.transactions.length, allowance, hideNumbers]);

  // Available months in ledger for filter dropdown
  const availableMonths = useMemo(() => {
    const set = new Set<string>([toIsoDate().slice(0, 7)]);
    for (const tx of db.transactions) {
      if (tx.date.length >= 7) set.add(tx.date.slice(0, 7));
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [db.transactions]);

  // Statistik independent period calculation
  const statMetrics = useMemo(() => {
    const filter =
      statFilterMode === "custom"
        ? {
            kind: "custom" as const,
            startDate: statStartDate,
            endDate: statEndDate,
          }
        : { kind: "month" as const, monthKey: statFilterMode };
    return computePeriodMetrics(db.transactions, filter);
  }, [db.transactions, statFilterMode, statStartDate, statEndDate]);

  // Filtered Riwayat list (supports YYYY-MM, all, or custom date range)
  const filteredTransactions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return [...db.transactions]
      .filter((tx) => {
        if (filterMonth === "custom") {
          if (riwayatStartDate && tx.date < riwayatStartDate) return false;
          if (riwayatEndDate && tx.date > riwayatEndDate) return false;
        } else if (filterMonth !== "all" && !tx.date.startsWith(filterMonth)) {
          return false;
        }
        if (filterType !== "all" && tx.type !== filterType) return false;
        if (filterAccount !== "all" && tx.accountId !== filterAccount)
          return false;
        if (
          q &&
          !tx.category.toLowerCase().includes(q) &&
          !tx.note.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const d = b.date.localeCompare(a.date);
        return d !== 0 ? d : b.createdAt.localeCompare(a.createdAt);
      });
  }, [
    db.transactions,
    filterMonth,
    riwayatStartDate,
    riwayatEndDate,
    filterType,
    filterAccount,
    searchQuery,
  ]);

  const filteredNet = useMemo(() => {
    let total = 0;
    for (const tx of filteredTransactions) {
      if (tx.type === "Masuk") total += tx.amount;
      if (tx.type === "Keluar") total -= tx.amount;
    }
    return total;
  }, [filteredTransactions]);

  // API mutations
  const openNewTx = (
    tab: "manual" | "ai",
    type: TransactionType = "Keluar",
    accountId?: string,
  ) => {
    setEditingTx(null);
    setTxSheetInitialTab(tab);
    setTxSheetInitialType(type);
    setTxSheetInitialAccountId(accountId);
    setTxSheetOpen(true);
  };

  const openReconcile = (accountId?: string) => {
    setReconcileAccountId(accountId);
    setReconcileOpen(true);
  };

  /** Call a state-mutating API; throws with the server's message (or a fallback) on any failure. */
  const callApi = async (
    url: string,
    init: RequestInit,
    fallback: string,
  ): Promise<AppDatabase> => {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      throw new Error(
        "Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.",
      );
    }
    const data = (await res.json().catch(() => ({}))) as AppDatabase & {
      error?: string;
    };
    if (!res.ok) throw new Error(data.error || fallback);
    return data;
  };
  const errMsg = (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback;

  const flushOfflineQueue = useCallback(async () => {
    if (isDemoMode || offlineQueue.length === 0) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    try {
      const batch = [...offlineQueue];
      const next = await callApi(
        "/api/transactions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: batch.map((q) => ({
              date: q.date,
              type: q.type,
              category: q.category,
              accountId: q.accountId,
              toAccountId: q.toAccountId,
              amount: q.amount,
              note: q.note,
              source: "manual",
            })),
          }),
        },
        "Gagal mengirim antrean transaksi offline.",
      );
      setOfflineQueue([]);
      saveOfflineQueue([]);
      applyDbState(next);
      showToast(`${batch.length} transaksi antrean offline berhasil terkirim.`);
    } catch {
      // Keep items queued until next online retry
    }
  }, [isDemoMode, offlineQueue]);

  useEffect(() => {
    if (!isOffline && offlineQueue.length > 0 && !isDemoMode) {
      void flushOfflineQueue();
    }
  }, [isOffline, offlineQueue.length, isDemoMode, flushOfflineQueue]);

  const handleSubmitReconcile = async (payload: {
    accountId: string;
    actualBalance: number;
    note: string;
  }) => {
    if (isDemoMode) {
      const target = db.accounts.find((a) => a.id === payload.accountId);
      if (!target) throw new Error("Pilih akun yang valid.");
      const cur = accountBalanceMap[target.id] ?? 0;
      const diff = Math.round(payload.actualBalance) - cur;
      if (diff === 0)
        throw new Error(
          `Saldo ${target.name} sudah sesuai (${formatRupiah(cur)}).`,
        );
      const nowIso = new Date().toISOString();
      mutateDemoDb((prev) => ({
        ...prev,
        transactions: [
          {
            id: `demo-rec-${Date.now()}`,
            date: toIsoDate(),
            type: "Koreksi",
            category: diff > 0 ? "Koreksi Tambah" : "Koreksi Kurang",
            accountId: target.id,
            amount: Math.abs(diff),
            note:
              payload.note.trim() ||
              `Koreksi ${target.name}: ${formatRupiah(cur)} ke ${formatRupiah(payload.actualBalance)}`,
            source: "reconciliation",
            sheetSyncStatus: "local_only",
            createdAt: nowIso,
            updatedAt: nowIso,
          },
          ...prev.transactions,
        ],
      }));
      showToast("Saldo berhasil dikoreksi (Mode Demo).");
      return;
    }
    applyDbState(
      await callApi(
        "/api/transactions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "reconcile",
            accountId: payload.accountId,
            actualBalance: payload.actualBalance,
            note: payload.note,
          }),
        },
        "Gagal menyimpan koreksi saldo.",
      ),
    );
    showToast("Saldo berhasil dikoreksi.");
  };

  const handleSaveSingle = async (payload: {
    id?: string;
    date: string;
    type: TransactionType;
    category: string;
    accountId: string;
    toAccountId?: string;
    amount: number;
    note: string;
  }) => {
    if (isDemoMode) {
      const nowIso = new Date().toISOString();
      mutateDemoDb((prev) => {
        if (payload.id) {
          return {
            ...prev,
            transactions: prev.transactions.map((t) =>
              t.id === payload.id
                ? {
                    ...t,
                    date: payload.date,
                    type: payload.type,
                    category: payload.category,
                    accountId: payload.accountId,
                    toAccountId:
                      payload.type === "Transfer"
                        ? payload.toAccountId
                        : undefined,
                    amount: payload.amount,
                    note: payload.note,
                    updatedAt: nowIso,
                  }
                : t,
            ),
          };
        }
        return {
          ...prev,
          transactions: [
            {
              id: `demo-tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              date: payload.date,
              type: payload.type,
              category: payload.category,
              accountId: payload.accountId,
              toAccountId:
                payload.type === "Transfer" ? payload.toAccountId : undefined,
              amount: payload.amount,
              note: payload.note,
              source: "manual",
              sheetSyncStatus: "local_only",
              createdAt: nowIso,
              updatedAt: nowIso,
            },
            ...prev.transactions,
          ],
        };
      });
      showToast(
        payload.id
          ? "Transaksi diperbarui."
          : "Transaksi disimpan (Mode Demo).",
      );
      return;
    }

    const queueOfflineTx = () => {
      const nowIso = new Date().toISOString();
      const tempId = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const item: QueuedTransactionPayload = {
        clientTempId: tempId,
        date: payload.date,
        type: payload.type,
        category: payload.category,
        accountId: payload.accountId,
        toAccountId:
          payload.type === "Transfer" ? payload.toAccountId : undefined,
        amount: payload.amount,
        note: payload.note,
        createdAt: nowIso,
      };
      setOfflineQueue((prev) => {
        const nextQueue = [...prev, item];
        saveOfflineQueue(nextQueue);
        return nextQueue;
      });
      setDb((prev) => ({
        ...prev,
        transactions: [
          {
            id: tempId,
            date: payload.date,
            type: payload.type,
            category: payload.category,
            accountId: payload.accountId,
            toAccountId:
              payload.type === "Transfer" ? payload.toAccountId : undefined,
            amount: payload.amount,
            note: payload.note
              ? `${payload.note} (Offline)`
              : "(Antrean Offline)",
            source: "manual",
            sheetSyncStatus: "pending",
            createdAt: nowIso,
            updatedAt: nowIso,
          },
          ...prev.transactions,
        ],
      }));
      showToast(
        "Sedang offline: transaksi masuk antrean dan akan terkirim saat sinyal kembali.",
      );
    };

    if (!payload.id && typeof navigator !== "undefined" && !navigator.onLine) {
      queueOfflineTx();
      return;
    }

    try {
      applyDbState(
        await callApi(
          "/api/transactions",
          {
            method: payload.id ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
          "Gagal menyimpan transaksi.",
        ),
      );
      showToast(payload.id ? "Transaksi diperbarui." : "Transaksi disimpan.");
    } catch (err) {
      if (!payload.id && err instanceof TypeError) {
        queueOfflineTx();
        return;
      }
      throw err;
    }
  };

  const handleSaveBatch = async (drafts: ParsedTransactionDraft[]) => {
    if (isDemoMode) {
      const nowIso = new Date().toISOString();
      mutateDemoDb((prev) => ({
        ...prev,
        transactions: [
          ...drafts.map((d, i) => ({
            id: `demo-ai-${Date.now()}-${i}`,
            date: d.date,
            type: d.type,
            category: d.category,
            accountId: d.accountId,
            toAccountId: d.toAccountId,
            amount: d.amount,
            note: d.note,
            source: "ai_text" as const,
            sheetSyncStatus: "local_only" as const,
            createdAt: nowIso,
            updatedAt: nowIso,
          })),
          ...prev.transactions,
        ],
      }));
      showToast(
        `${drafts.length} transaksi dari AI berhasil dicatat (Mode Demo).`,
      );
      return;
    }
    applyDbState(
      await callApi(
        "/api/transactions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: drafts.map((d) => ({
              date: d.date,
              type: d.type,
              category: d.category,
              accountId: d.accountId,
              toAccountId: d.toAccountId,
              amount: d.amount,
              note: d.note,
              source: "ai_text",
            })),
          }),
        },
        "Gagal menyimpan daftar transaksi.",
      ),
    );
    showToast(`${drafts.length} transaksi dari AI berhasil dicatat.`);
  };

  const handleDeleteTx = async (id: string) => {
    if (isDemoMode) {
      mutateDemoDb((prev) => ({
        ...prev,
        transactions: prev.transactions.filter((t) => t.id !== id),
      }));
      setConfirmDeleteTxId(null);
      showToast("Transaksi dihapus.");
      return;
    }
    setBusyAction(true);
    try {
      applyDbState(
        await callApi(
          `/api/transactions?id=${encodeURIComponent(id)}`,
          { method: "DELETE" },
          "Gagal menghapus transaksi.",
        ),
      );
      setConfirmDeleteTxId(null);
      showToast("Transaksi dihapus.");
    } catch (err) {
      setGlobalError(errMsg(err, "Gagal menghapus transaksi."));
    } finally {
      setBusyAction(false);
    }
  };

  const handleAddCategory = async (
    name: string,
    type: "Masuk" | "Keluar",
    iconKey: string,
  ) => {
    if (isDemoMode) {
      const clean = name.trim().slice(0, 40);
      if (!clean) throw new Error("Nama kategori wajib diisi.");
      if (
        db.categories.some(
          (c) =>
            c.type === type && c.name.toLowerCase() === clean.toLowerCase(),
        )
      ) {
        throw new Error(`Kategori "${clean}" sudah ada.`);
      }
      mutateDemoDb((prev) => ({
        ...prev,
        categories: [
          ...prev.categories,
          { id: `demo-cat-${Date.now()}`, name: clean, type, iconKey },
        ],
      }));
      return;
    }
    setDb(
      await callApi(
        "/api/state",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "add_category",
            categoryName: name,
            categoryType: type,
            iconKey,
          }),
        },
        "Gagal menambah kategori.",
      ),
    );
  };

  const handleUpdateCategory = async (
    categoryId: string,
    updates: { name?: string; iconKey?: string },
  ) => {
    if (isDemoMode) {
      mutateDemoDb((prev) => {
        const target = prev.categories.find((c) => c.id === categoryId);
        if (!target) return prev;
        const nextName = updates.name?.trim().slice(0, 40) || target.name;
        return {
          ...prev,
          categories: prev.categories.map((c) =>
            c.id === categoryId
              ? { ...c, name: nextName, iconKey: updates.iconKey ?? c.iconKey }
              : c,
          ),
          transactions:
            nextName !== target.name
              ? prev.transactions.map((tx) =>
                  tx.type === target.type && tx.category === target.name
                    ? { ...tx, category: nextName }
                    : tx,
                )
              : prev.transactions,
        };
      });
      return;
    }
    applyDbState(
      await callApi(
        "/api/state",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update_category",
            categoryId,
            categoryName: updates.name,
            iconKey: updates.iconKey,
          }),
        },
        "Gagal memperbarui kategori.",
      ),
    );
  };

  const handleDeleteCategory = async (
    categoryId: string,
    replacementCategory?: string,
  ) => {
    if (isDemoMode) {
      mutateDemoDb((prev) => {
        const target = prev.categories.find((c) => c.id === categoryId);
        if (!target) return prev;
        const remaining = prev.categories.filter((c) => c.id !== categoryId);
        const fallback =
          replacementCategory ||
          remaining.find((c) => c.type === target.type)?.name ||
          "Lain-lain";
        return {
          ...prev,
          categories: remaining,
          transactions: prev.transactions.map((tx) =>
            tx.type === target.type && tx.category === target.name
              ? { ...tx, category: fallback }
              : tx,
          ),
        };
      });
      return;
    }
    applyDbState(
      await callApi(
        "/api/state",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "delete_category",
            categoryId,
            replacementCategory,
          }),
        },
        "Gagal menghapus kategori.",
      ),
    );
  };

  const handleReorderCategories = async (
    type: "Masuk" | "Keluar",
    orderedIds: string[],
  ) => {
    if (isDemoMode) {
      mutateDemoDb((prev) => {
        const sameType = prev.categories.filter((c) => c.type === type);
        const byId = new Map(sameType.map((c) => [c.id, c]));
        const reordered = orderedIds
          .map((id) => byId.get(id))
          .filter((c): c is NonNullable<typeof c> => Boolean(c));
        const others = prev.categories.filter((c) => c.type !== type);
        return {
          ...prev,
          categories:
            type === "Keluar"
              ? [...reordered, ...others]
              : [...others, ...reordered],
        };
      });
      return;
    }
    setDb(
      await callApi(
        "/api/state",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "reorder_categories",
            categoryType: type,
            orderedIds,
          }),
        },
        "Gagal menyimpan urutan kategori.",
      ),
    );
  };

  const handleLoadSimulation = async () => {
    if (isDemoMode) {
      mutateDemoDb((prev) => ({
        ...prev,
        transactions: [...buildDemoSampleTransactions(), ...prev.transactions],
      }));
      showToast("Data simulasi contoh dimuat.");
      return;
    }
    setBusyAction(true);
    try {
      applyDbState(
        await callApi(
          "/api/state",
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "load_simulation" }),
          },
          "Gagal memuat data simulasi.",
        ),
        "full",
      );
      showToast("Data simulasi contoh dimuat.");
    } catch (err) {
      setGlobalError(errMsg(err, "Gagal memuat data simulasi."));
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveSettings = async (payload: {
    monthlyBudget: number;
    paydayDay: number;
    categoryPreset: WorkspaceSettings["categoryPreset"];
    initialBalances: Record<string, number>;
  }) => {
    if (isDemoMode) {
      mutateDemoDb((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          monthlyBudget: payload.monthlyBudget,
          paydayDay: payload.paydayDay,
          categoryPreset: payload.categoryPreset,
        },
        accounts: prev.accounts.map((acc) => ({
          ...acc,
          initialBalance: payload.initialBalances[acc.id] ?? acc.initialBalance,
        })),
      }));
      showToast("Pengaturan anggaran & saldo awal diperbarui (Mode Demo).");
      return;
    }
    const next = await callApi(
      "/api/state",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      "Gagal menyimpan pengaturan.",
    );
    setDb(next);
    showToast("Pengaturan anggaran, saldo awal, dan kategori diperbarui.");
  };

  const handleAddAccount = async (
    name: string,
    kind: AccountKind,
    initialBalance: number,
  ) => {
    if (isDemoMode) {
      const clean = name.trim().slice(0, 40);
      if (!clean) throw new Error("Nama dompet wajib diisi.");
      if (
        db.accounts.some((a) => a.name.toLowerCase() === clean.toLowerCase())
      ) {
        throw new Error(`Dompet "${clean}" sudah ada.`);
      }
      mutateDemoDb((prev) => ({
        ...prev,
        accounts: [
          ...prev.accounts,
          {
            id: `demo-acc-${Date.now()}`,
            name: clean,
            kind,
            initialBalance: Math.max(0, initialBalance),
          },
        ],
      }));
      showToast(`Dompet "${clean}" ditambahkan.`);
      return;
    }
    const next = await callApi(
      "/api/state",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_account",
          accountName: name,
          accountKind: kind,
          accountInitialBalance: initialBalance,
        }),
      },
      "Gagal menambah dompet.",
    );
    setDb(next);
    showToast(`Dompet "${name.trim()}" ditambahkan.`);
  };

  const handleDeleteAccount = async (accountId: string) => {
    const acc = db.accounts.find((a) => a.id === accountId);
    if (
      !window.confirm(
        `Hapus dompet "${acc?.name ?? ""}"? Transaksi yang memakai dompet ini akan dipindahkan ke dompet lain yang tersisa.`,
      )
    ) {
      return;
    }
    if (isDemoMode) {
      if (db.accounts.length <= 1)
        throw new Error("Minimal harus ada 1 dompet aktif.");
      const fallback = db.accounts.find((a) => a.id !== accountId)!;
      mutateDemoDb((prev) => ({
        ...prev,
        accounts: prev.accounts.filter((a) => a.id !== accountId),
        transactions: prev.transactions.map((tx) => ({
          ...tx,
          accountId: tx.accountId === accountId ? fallback.id : tx.accountId,
          toAccountId:
            tx.toAccountId === accountId
              ? fallback.id === tx.accountId
                ? undefined
                : fallback.id
              : tx.toAccountId,
        })),
      }));
      showToast("Dompet dihapus.");
      return;
    }
    const next = await callApi(
      "/api/state",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_account", accountId }),
      },
      "Gagal menghapus dompet.",
    );
    applyDbState(next);
    showToast("Dompet dihapus.");
  };

  const handleClearAll = async () => {
    if (isDemoMode) {
      mutateDemoDb((prev) => ({ ...prev, transactions: [], goals: [] }));
      showToast("Semua transaksi dan target dibersihkan.");
      return;
    }
    const next = await callApi(
      "/api/state",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_all_data" }),
      },
      "Gagal menghapus semua data.",
    );
    setDb(next);
    showToast("Semua transaksi dan target dibersihkan.");
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetAmount = parseInt(goalTargetRaw.replace(/\D/g, ""), 10) || 0;
    if (!goalName.trim() || targetAmount <= 0) {
      setModalError("Isi nama target dan nominal lebih dari Rp 0.");
      return;
    }
    if (isDemoMode) {
      mutateDemoDb((prev) => ({
        ...prev,
        goals: [
          ...prev.goals,
          {
            id: `demo-goal-${Date.now()}`,
            name: goalName.trim().slice(0, 60),
            targetAmount,
            currentAmount: 0,
            createdAt: new Date().toISOString(),
          },
        ],
      }));
      setGoalModalOpen(false);
      setGoalName("");
      setGoalTargetRaw("");
      showToast("Target tabungan dibuat.");
      return;
    }
    setBusyAction(true);
    setModalError(null);
    try {
      setDb(
        await callApi(
          "/api/goals",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "create_goal",
              name: goalName.trim(),
              targetAmount,
            }),
          },
          "Gagal membuat target tabungan.",
        ),
      );
      setGoalModalOpen(false);
      setGoalName("");
      setGoalTargetRaw("");
      showToast("Target tabungan dibuat.");
    } catch (err) {
      setModalError(errMsg(err, "Gagal membuat target tabungan."));
    } finally {
      setBusyAction(false);
    }
  };

  const handleDepositGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseInt(depositRaw.replace(/\D/g, ""), 10) || 0;
    if (!depositModalGoalId || amount <= 0) {
      setModalError("Masukkan nominal setoran lebih dari Rp 0.");
      return;
    }
    if (isDemoMode) {
      const goal = db.goals.find((g) => g.id === depositModalGoalId);
      if (!goal) return;
      const nowIso = new Date().toISOString();
      mutateDemoDb((prev) => ({
        ...prev,
        transactions: [
          {
            id: `demo-dep-${Date.now()}`,
            date: toIsoDate(),
            type: "Keluar",
            category: "Tabungan",
            accountId: depositAccountId,
            amount,
            note: `Setor target: ${goal.name}`,
            goalId: goal.id,
            source: "manual",
            sheetSyncStatus: "local_only",
            createdAt: nowIso,
            updatedAt: nowIso,
          },
          ...prev.transactions,
        ],
      }));
      setDepositModalGoalId(null);
      setDepositRaw("");
      showToast("Setoran tabungan berhasil dicatat.");
      return;
    }
    setBusyAction(true);
    setModalError(null);
    try {
      applyDbState(
        await callApi(
          "/api/goals",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "deposit_goal",
              goalId: depositModalGoalId,
              amount,
              accountId: depositAccountId,
            }),
          },
          "Gagal mencatat setoran.",
        ),
      );
      setDepositModalGoalId(null);
      setDepositRaw("");
      showToast("Setoran tabungan berhasil dicatat.");
    } catch (err) {
      setModalError(errMsg(err, "Gagal mencatat setoran."));
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteGoal = async (id: string) => {
    const goal = db.goals.find((g) => g.id === id);
    if (
      !window.confirm(
        `Hapus target "${goal?.name ?? ""}"? Semua setorannya ikut dihapus dan uangnya kembali ke saldo akun asal.`,
      )
    ) {
      return;
    }
    if (isDemoMode) {
      mutateDemoDb((prev) => ({
        ...prev,
        goals: prev.goals.filter((g) => g.id !== id),
        transactions: prev.transactions.filter((t) => t.goalId !== id),
      }));
      showToast("Target tabungan dihapus.");
      return;
    }
    setBusyAction(true);
    try {
      applyDbState(
        await callApi(
          `/api/goals?id=${encodeURIComponent(id)}`,
          { method: "DELETE" },
          "Gagal menghapus target tabungan.",
        ),
      );
      showToast("Target tabungan dihapus.");
    } catch (err) {
      setGlobalError(errMsg(err, "Gagal menghapus target tabungan."));
    } finally {
      setBusyAction(false);
    }
  };

  const handleAddRecurring = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseInt(recAmountRaw.replace(/\D/g, ""), 10) || 0;
    const cleanName = recName.trim().slice(0, 50);
    if (!cleanName || amount <= 0) {
      showToast("Isi nama dan nominal jadwal rutin terlebih dahulu.");
      return;
    }
    const day = parseInt(recDay, 10);
    if (!day || day < 1 || day > 31) {
      showToast("Tanggal rutin harus antara 1 sampai 31.");
      return;
    }
    const item: RecurringTemplate = {
      id: `rec-${Date.now()}`,
      name: cleanName,
      type: recType,
      category: recCategory,
      accountId: recAccountId,
      amount,
      dayOfMonth: day,
    };
    updateExtras((prev) => ({ ...prev, recurring: [...prev.recurring, item] }));
    setRecName("");
    setRecAmountRaw("");
    setRecDay("1");
    showToast(`Jadwal rutin "${cleanName}" disimpan.`);
  };

  const handleApplyRecurring = async (item: RecurringTemplate) => {
    const todayIso = toIsoDate();
    const ym = todayIso.slice(0, 7);
    try {
      await handleSaveSingle({
        date: todayIso,
        type: item.type,
        category: item.category,
        accountId: db.accounts.some((a) => a.id === item.accountId)
          ? item.accountId
          : db.accounts[0]?.id || "acc-cash",
        amount: item.amount,
        note: `[Rutin] ${item.name}`,
      });
      updateExtras((prev) => ({
        ...prev,
        recurring: prev.recurring.map((r) =>
          r.id === item.id ? { ...r, lastRecordedMonth: ym } : r,
        ),
      }));
    } catch (err) {
      setGlobalError(errMsg(err, "Gagal mencatat transaksi rutin."));
    }
  };

  const handleDeleteRecurring = (id: string) => {
    updateExtras((prev) => ({
      ...prev,
      recurring: prev.recurring.filter((r) => r.id !== id),
    }));
    showToast("Jadwal rutin dihapus.");
  };

  const handleSaveCategoryBudget = (e: React.FormEvent) => {
    e.preventDefault();
    const cap = parseInt(budgetCatCapRaw.replace(/\D/g, ""), 10) || 0;
    if (!budgetCatName || cap <= 0) {
      showToast("Masukkan batas nominal kategori lebih dari Rp 0.");
      return;
    }
    updateExtras((prev) => ({
      ...prev,
      categoryBudgets: { ...prev.categoryBudgets, [budgetCatName]: cap },
    }));
    setBudgetCatCapRaw("");
    showToast(`Batas bulanan ${budgetCatName} disimpan.`);
  };

  const handleDeleteCategoryBudget = (catName: string) => {
    updateExtras((prev) => {
      const nextCaps = { ...prev.categoryBudgets };
      delete nextCaps[catName];
      return { ...prev, categoryBudgets: nextCaps };
    });
  };

  const handleExportCsv = () => {
    if (filteredTransactions.length === 0) {
      showToast("Tidak ada transaksi pada filter aktif untuk diekspor.");
      return;
    }
    const headers = [
      "Transaction ID",
      "Tanggal",
      "Jenis",
      "Kategori",
      "Akun",
      "Nominal",
      "Keterangan",
    ];
    const lines = [headers.join(",")];
    for (const tx of filteredTransactions) {
      const acc =
        db.accounts.find((a) => a.id === tx.accountId)?.name || tx.accountId;
      lines.push(
        [
          escapeCsvCell(tx.id),
          escapeCsvCell(tx.date),
          escapeCsvCell(tx.type),
          escapeCsvCell(tx.category),
          escapeCsvCell(acc),
          String(tx.amount),
          escapeCsvCell(tx.note),
        ].join(","),
      );
    }
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `CatatCepat_${toIsoDate()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleAskGuri = async (questionText: string) => {
    const q = questionText.trim();
    if (!q) return;
    setAskInput(q);
    if (isDemoMode) {
      setAskAnswer(
        answerFinancialQuestion(
          q,
          db.transactions,
          db.accounts,
          db.settings.monthlyBudget,
          db.settings.paydayDay,
        ),
      );
      return;
    }
    setAskLoading(true);
    try {
      const res = await fetch("/api/ai/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "ask", question: q }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        answer?: string;
        error?: string;
        warning?: string;
        aiCreditsRemaining?: number;
      };
      if (typeof data.aiCreditsRemaining === "number") {
        setDb((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            aiCreditsRemaining: data.aiCreditsRemaining,
          },
        }));
      }
      setAskAnswer(
        data.answer
          ? data.warning
            ? `${data.answer}\n(${data.warning})`
            : data.answer
          : data.error || "Belum bisa memproses pertanyaan. Coba lagi.",
      );
    } catch {
      setAskAnswer(
        "Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.",
      );
    } finally {
      setAskLoading(false);
    }
  };

  const displayMoney = (val: number) =>
    hideNumbers ? "Rp ***" : formatRupiah(val);

  const totalGoalsSaved = db.goals.reduce((s, g) => s + g.currentAmount, 0);
  const currentMonthPrefix = toIsoDate().slice(0, 7);
  const monthlyGoalDeposits = db.transactions
    .filter((t) => t.goalId && t.date.startsWith(currentMonthPrefix))
    .reduce((s, t) => s + t.amount, 0);

  const navItems: Array<{
    key: NavTab;
    label: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    { key: "beranda", label: "Catat", icon: HomeIcon },
    { key: "riwayat", label: "Riwayat", icon: ListIcon },
    { key: "tabungan", label: "Tabungan", icon: SavingsIcon },
    { key: "statistik", label: "Statistik", icon: ChartIcon },
  ];

  const formatMonthLabel = (ym: string) => {
    const [y, m] = ym.split("-");
    const names = [
      "Januari",
      "Februari",
      "Maret",
      "April",
      "Mei",
      "Juni",
      "Juli",
      "Agustus",
      "September",
      "Oktober",
      "November",
      "Desember",
    ];
    const idx = parseInt(m, 10) - 1;
    return names[idx] ? `${names[idx]} ${y}` : ym;
  };

  const statTrendYear = /^\d{4}-\d{2}$/.test(statFilterMode)
    ? parseInt(statFilterMode.slice(0, 4), 10)
    : new Date().getFullYear();

  const showLandingPage = Boolean(
    db.auth?.configured && !db.auth?.authenticated && !demoBypass,
  );

  if (showLandingPage) {
    return (
      <LandingPage
        db={db}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
        themeColor={themeColor}
        onChangeTheme={handleChangeTheme}
        initialError={globalError}
        onAuthSuccess={(nextDb, msg) => {
          setDb(nextDb);
          setGlobalError(null);
          showToast(msg);
        }}
        onEnterDemo={() => {
          setDb((prev) => loadDemoDb(prev));
          setDemoBypass(true);
          showToast(
            "Mode Demo pribadi dibuka di browser ini. Masuk akun kapan saja untuk menyimpan.",
          );
        }}
      />
    );
  }

  return (
    <div className="min-h-app bg-[var(--bg-canvas)] text-[var(--text-primary)] md:flex">
      {/* Desktop Left Navigation Rail (Reflows from mobile bottom dock per antislop-layoutmobile) */}
      <aside className="no-print hidden md:flex md:w-64 md:shrink-0 md:flex-col md:border-r md:border-[var(--border-subtle)] md:bg-[var(--bg-card)] md:p-4">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-soft)]">
            <OctopusMascot mood="saving" size={34} />
          </div>
          <div>
            <span className="block text-base font-extrabold tracking-tight text-[var(--text-primary)]">
              CatatCepat
            </span>
            <span className="block text-[11px] font-semibold text-[var(--text-muted)]">
              {APP_SLOGAN}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => openNewTx("manual", "Keluar")}
          className="mt-4 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand-primary)] px-4 text-sm font-extrabold text-white shadow-xs hover:bg-[var(--brand-hover)]"
        >
          <PlusIcon className="h-4 w-4" />
          Catat Transaksi
        </button>

        <nav aria-label="Navigasi utama" className="mt-5 flex-1 space-y-1.5">
          {navItems.map(({ key, label, icon: Icon }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 text-sm font-bold transition-colors ${
                  active
                    ? "bg-[var(--bg-soft)] text-[var(--brand-primary)] dark:text-[#fda4af]"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-soft)]/50 hover:text-[var(--text-primary)]"
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="space-y-2.5 border-t border-[var(--border-subtle)] pt-4">
          <button
            type="button"
            onClick={() => openSheetsTab("sheets")}
            className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
          >
            <span className="flex items-center gap-2">
              <SheetIcon className="h-4 w-4 text-[var(--brand-primary)] dark:text-[#fda4af]" />
              Google Sheets
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              {db.sheetConnection.connected ? "Aktif" : "Belum"}
            </span>
          </button>

          <button
            type="button"
            onClick={toggleDarkMode}
            className="flex min-h-[42px] w-full items-center justify-between rounded-xl px-3 text-xs font-bold text-[var(--text-muted)] hover:bg-[var(--bg-soft)] hover:text-[var(--text-primary)]"
          >
            <span>{darkMode ? "Mode Terang" : "Mode Gelap"}</span>
            <ThemeIcon dark={darkMode} className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 pb-24 md:pb-8">
        {/* Top Bar */}
        <header className="no-print sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--nav-bg)] px-4 py-3 backdrop-blur-sm md:px-8">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-2.5 gap-y-2 sm:flex-nowrap">
            <div className="flex min-w-[165px] items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-soft)]">
                <OctopusMascot mood="saving" size={30} />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-extrabold tracking-tight text-[var(--text-primary)] sm:text-lg">
                  {activeTab === "beranda"
                    ? "CatatCepat"
                    : activeTab === "riwayat"
                      ? "Riwayat Transaksi"
                      : activeTab === "tabungan"
                        ? "Target Tabungan"
                        : "Statistik Keuangan"}
                </h1>
                <p className="text-[11px] leading-tight text-[var(--text-muted)] sm:text-xs">
                  {activeTab === "beranda" ? APP_SLOGAN : db.settings.name}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => openSheetsTab("sheets")}
                aria-label="Pengaturan Google Sheets dan anggaran"
                className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 text-[11px] font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)] sm:px-3 sm:text-xs"
              >
                {db.sheetConnection.connected ? (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-[#047857]"
                    aria-hidden="true"
                  />
                ) : (
                  <SheetIcon className="h-4 w-4 shrink-0 text-[var(--brand-primary)] dark:text-[#fda4af] sm:h-3.5 sm:w-3.5" />
                )}
                <span className="whitespace-nowrap">Sheets &amp; Atur</span>
              </button>

              <button
                type="button"
                onClick={toggleDarkMode}
                aria-label={
                  darkMode ? "Aktifkan mode terang" : "Aktifkan mode gelap"
                }
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--bg-soft)] md:hidden"
              >
                <ThemeIcon dark={darkMode} className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Feedback Toast & Global Error */}
        <div className="px-4 pt-3 md:px-8">
          <div className="mx-auto max-w-4xl">
            {db.auth?.authenticated &&
              db.sheetConnection.configured &&
              !db.sheetConnection.connected &&
              !sheetPromptDismissed && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-soft)] px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-extrabold text-[var(--text-primary)]">
                      Buat Google Sheets pribadi sekarang?
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Sekali klik agar catatan Anda otomatis tersimpan ke Google
                      Drive sendiri.
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={quickSheetBusy}
                      onClick={handleQuickConnectSheets}
                      className="min-h-[38px] rounded-xl bg-[var(--brand-primary)] px-3.5 text-xs font-extrabold text-white hover:bg-[var(--brand-hover)] disabled:opacity-60"
                    >
                      {quickSheetBusy ? "Membuka..." : "Buat Sheet Sekarang"}
                    </button>
                    <button
                      type="button"
                      onClick={dismissSheetPrompt}
                      className="min-h-[38px] rounded-xl px-2.5 text-xs font-bold text-[var(--text-muted)] hover:bg-[var(--bg-card)]"
                    >
                      Nanti
                    </button>
                  </div>
                </div>
              )}
            {db.auth?.configured && !db.auth?.authenticated && demoBypass && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-soft)] px-4 py-2.5 text-xs font-bold text-[var(--text-primary)]">
                <span>
                  Mode Demo Pribadi: tersimpan lokal di browser ini. Masuk akun
                  untuk sinkron Cloud &amp; Sheets.
                </span>
                <button
                  type="button"
                  onClick={() => setDemoBypass(false)}
                  className="min-h-[44px] rounded-xl bg-[var(--brand-primary)] px-3.5 py-2 text-xs font-extrabold text-white hover:bg-[var(--brand-hover)]"
                >
                  Masuk / Daftar Akun
                </button>
              </div>
            )}
            {(isOffline || offlineQueue.length > 0) && !isDemoMode && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#D97706] bg-[#FEF3C7] px-4 py-2.5 text-xs font-bold text-[#92400E] dark:bg-[#451A03] dark:text-[#FDE68A]">
                <span>
                  {isOffline
                    ? `Mode Offline aktif.${offlineQueue.length > 0 ? ` ${offlineQueue.length} transaksi menunggu koneksi.` : " Transaksi baru akan masuk antrean otomatis."}`
                    : `${offlineQueue.length} transaksi antrean offline siap dikirim.`}
                </span>
                {!isOffline && offlineQueue.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void flushOfflineQueue()}
                    className="min-h-[36px] rounded-lg bg-[#92400E] px-3 text-xs font-extrabold text-white hover:bg-[#78350F]"
                  >
                    Kirim Sekarang
                  </button>
                )}
              </div>
            )}
            {(() => {
              const todayDay = new Date().getDate();
              const dueItems = extras.recurring.filter(
                (r) =>
                  r.dayOfMonth <= todayDay &&
                  r.lastRecordedMonth !== currentMonthPrefix,
              );
              if (dueItems.length === 0) return null;
              const first = dueItems[0];
              return (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-2.5 text-xs">
                  <span className="font-bold text-[var(--text-primary)]">
                    Jadwal rutin bulan ini: <strong>{first.name}</strong> (
                    {displayMoney(first.amount)})
                    {dueItems.length > 1
                      ? ` +${dueItems.length - 1} lainnya`
                      : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleApplyRecurring(first)}
                      className="min-h-[34px] rounded-lg bg-[var(--brand-primary)] px-3 text-xs font-extrabold text-white hover:bg-[var(--brand-hover)]"
                    >
                      Catat 1 Klik
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("tabungan")}
                      className="min-h-[34px] rounded-lg border border-[var(--border-subtle)] px-2.5 text-xs font-bold text-[var(--text-muted)] hover:bg-[var(--bg-soft)]"
                    >
                      Kelola
                    </button>
                  </div>
                </div>
              );
            })()}
            {toast && (
              <div
                role="status"
                className="mb-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--brand-deep)] px-4 py-2.5 text-xs font-bold text-white shadow-sm"
              >
                {toast}
              </div>
            )}
            {globalError && (
              <div
                role="alert"
                className="mb-3 flex items-center justify-between gap-2 rounded-2xl bg-[var(--expense-bg)] px-4 py-2.5 text-xs font-bold text-[var(--expense-text)]"
              >
                <span>{globalError}</span>
                <button
                  type="button"
                  onClick={() => setGlobalError(null)}
                  className="underline"
                >
                  Tutup
                </button>
              </div>
            )}
          </div>
        </div>

        <main className="px-4 pt-2 pb-28 md:px-8 md:pb-8">
          <div className="mx-auto max-w-4xl space-y-5">
            {/* ================================================= */}
            {/* TAB 1: CATAT / BERANDA                            */}
            {/* ================================================= */}
            {activeTab === "beranda" && (
              <>
                {/* Attractive Theme-Reactive Hero Strip: Balance + Daily Safe Allowance + Theme Dots + Hide Toggle */}
                <div className="hero-maroon-gradient rounded-2xl px-4 py-3.5 text-white shadow-sm sm:px-5 sm:py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 tabular-nums">
                      <div>
                        <span className="block text-[11px] font-semibold text-white/85">
                          Total Saldo · Semua Waktu
                        </span>
                        <strong className="mt-0.5 block text-lg font-extrabold tracking-tight text-white sm:text-xl">
                          {displayMoney(totalAssets)}
                        </strong>
                      </div>

                      <div
                        className="hidden h-9 w-px bg-white/25 sm:block"
                        aria-hidden="true"
                      />

                      <div>
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white/85">
                          Jatah Hari Ini
                          <button
                            type="button"
                            onClick={() => setFormulaModalOpen(true)}
                            className="rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-bold text-white transition-colors hover:bg-white/25"
                          >
                            Rumus
                          </button>
                        </span>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2">
                          <strong className="text-lg font-extrabold tracking-tight text-white sm:text-xl">
                            {displayMoney(allowance.remainingToday)}
                          </strong>
                          {allowance.remainingToday < 0 && !hideNumbers && (
                            <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-extrabold text-[#92400E]">
                              Lewat batas
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <ThemeDots
                        compact
                        showLabel={false}
                        value={themeColor}
                        onChange={handleChangeTheme}
                      />
                      <button
                        type="button"
                        onClick={() => setHideNumbers((v) => !v)}
                        aria-label={
                          hideNumbers
                            ? "Tampilkan nominal"
                            : "Sembunyikan nominal"
                        }
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/15 text-white transition-colors hover:bg-white/25"
                      >
                        <EyeIcon off={hideNumbers} className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Equal-height Split on Desktop, Immediate 1-Screen Input First on Phone */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-stretch">
                  <section className="flex h-full flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 sm:p-5 lg:col-span-7">
                    <TransactionForm
                      active={activeTab === "beranda"}
                      inline
                      accounts={db.accounts}
                      balances={accountBalanceMap}
                      categories={db.categories}
                      categoryTxCounts={categoryUsageCounts}
                      onSaveSingle={handleSaveSingle}
                      onSaveBatch={handleSaveBatch}
                      onAddCategory={handleAddCategory}
                      onUpdateCategory={handleUpdateCategory}
                      onDeleteCategory={handleDeleteCategory}
                      onReorderCategories={handleReorderCategories}
                    />
                  </section>

                  <section className="flex h-full flex-col justify-between gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 sm:p-5 lg:col-span-5">
                    <div className="space-y-4">
                      {/* Period Selector & Cashflow Summary */}
                      <div>
                        <div
                          className="no-scrollbar flex gap-1 overflow-x-auto pb-1"
                          role="group"
                          aria-label="Rentang waktu ringkasan"
                        >
                          {(
                            [
                              { key: "today", label: "Hari ini" },
                              { key: "week", label: "Minggu" },
                              { key: "month", label: "Bulan" },
                              { key: "year", label: "Tahun" },
                            ] as const
                          ).map((item) => {
                            const active = timeRange === item.key;
                            return (
                              <button
                                key={item.key}
                                type="button"
                                onClick={() => setTimeRange(item.key)}
                                aria-pressed={active}
                                className={`min-h-[34px] shrink-0 whitespace-nowrap rounded-lg px-2.5 text-[11px] font-bold transition-colors ${
                                  active
                                    ? "bg-[var(--brand-primary)] text-white"
                                    : "bg-[var(--bg-canvas)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                }`}
                              >
                                {item.label}
                              </button>
                            );
                          })}
                        </div>

                        <div className="mt-2.5 grid grid-cols-2 gap-2 tabular-nums">
                          <div className="rounded-xl bg-[var(--income-bg)] px-3 py-2.5">
                            <span className="block text-[11px] font-bold text-[var(--income-text)]">
                              Pemasukan
                            </span>
                            <strong className="mt-0.5 block text-sm font-extrabold text-[var(--income-text)]">
                              {displayMoney(metrics.income)}
                            </strong>
                          </div>
                          <div className="rounded-xl bg-[var(--expense-bg)] px-3 py-2.5">
                            <span className="block text-[11px] font-bold text-[var(--expense-text)]">
                              Pengeluaran
                            </span>
                            <strong className="mt-0.5 block text-sm font-extrabold text-[var(--expense-text)]">
                              {displayMoney(metrics.expense)}
                            </strong>
                          </div>
                        </div>
                      </div>

                      {/* Multi-Wallet Balances */}
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h2 className="whitespace-nowrap text-xs font-extrabold text-[var(--text-primary)]">
                            Saldo per Akun
                          </h2>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {db.transactions.length > 0 ||
                            accountBalances.some((a) => a.balance !== 0) ? (
                              <button
                                type="button"
                                onClick={() => openReconcile()}
                                className="flex min-h-[32px] items-center gap-1 whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 text-[11px] font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
                              >
                                <ScaleIcon className="h-3 w-3 shrink-0" />
                                Koreksi
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openSheetsTab("atur")}
                                className="flex min-h-[32px] items-center whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 text-[11px] font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
                              >
                                Saldo Awal
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openNewTx("manual", "Transfer")}
                              className="flex min-h-[32px] items-center gap-1 whitespace-nowrap rounded-lg bg-[var(--bg-soft)] px-2 text-[11px] font-bold text-[var(--brand-primary)] dark:text-[#fda4af]"
                            >
                              <TransferIcon className="h-3 w-3 shrink-0" />
                              Transfer
                            </button>
                            <button
                              type="button"
                              onClick={() => openSheetsTab("atur")}
                              className="flex min-h-[32px] items-center whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 text-[11px] font-bold text-[var(--text-muted)] hover:bg-[var(--bg-soft)] hover:text-[var(--text-primary)]"
                            >
                              + Dompet
                            </button>
                          </div>
                        </div>

                        <div className="mt-2 space-y-1.5">
                          {accountBalances.map((acc) => (
                            <div
                              key={acc.id}
                              className="flex items-center justify-between rounded-xl bg-[var(--bg-canvas)] px-3 py-2"
                            >
                              <span className="text-xs font-bold text-[var(--text-primary)]">
                                {acc.name}
                              </span>
                              <span
                                className={`text-xs font-extrabold tabular-nums ${
                                  acc.balance < 0
                                    ? "text-[var(--expense-text)]"
                                    : "text-[var(--text-primary)]"
                                }`}
                              >
                                {displayMoney(acc.balance)}
                              </span>
                            </div>
                          ))}
                        </div>

                        {hasNegativeBalance && (
                          <p className="mt-2 rounded-xl bg-[#FEF3C7] px-3 py-2 text-[11px] font-semibold text-[#92400E] dark:bg-[#451A03] dark:text-[#FDE68A]">
                            Ada saldo minus.{" "}
                            <button
                              type="button"
                              onClick={() => openSheetsTab("atur")}
                              className="font-extrabold underline"
                            >
                              Isi Saldo Awal
                            </button>{" "}
                            atau{" "}
                            <button
                              type="button"
                              onClick={() =>
                                openReconcile(
                                  accountBalances.find((a) => a.balance < 0)
                                    ?.id,
                                )
                              }
                              className="font-extrabold underline"
                            >
                              Koreksi
                            </button>
                            .
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Compact Guri Mascot Strip */}
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3">
                      <div className="flex items-center gap-3">
                        <OctopusMascot
                          mood={guriState.mood}
                          accessory={streak.accessory}
                          size={40}
                          className="shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-extrabold text-[var(--text-primary)]">
                              Guri si Gurita
                            </span>
                            <span className="rounded-full bg-[var(--bg-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--brand-primary)] dark:text-[#fda4af]">
                              Streak {streak.streakDays} hari
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                            {guriState.message}
                          </p>
                        </div>
                      </div>

                      {!db.auth?.authenticated &&
                        db.transactions.length === 0 && (
                          <div className="mt-2.5 border-t border-[var(--border-subtle)] pt-2">
                            <button
                              type="button"
                              disabled={busyAction}
                              onClick={handleLoadSimulation}
                              className="text-[11px] font-bold text-[var(--brand-primary)] underline dark:text-[#fda4af]"
                            >
                              Muat contoh simulasi transaksi
                            </button>
                          </div>
                        )}
                    </div>
                  </section>
                </div>
              </>
            )}

            {/* ================================================= */}
            {/* TAB 2: RIWAYAT                                    */}
            {/* ================================================= */}
            {activeTab === "riwayat" && (
              <HistoryTab
                accounts={db.accounts}
                categories={db.categories}
                totalTransactionsCount={db.transactions.length}
                filteredTransactions={filteredTransactions}
                filteredNet={filteredNet}
                accountBalances={accountBalances}
                availableMonths={availableMonths}
                formatMonthLabel={formatMonthLabel}
                filterMonth={filterMonth}
                setFilterMonth={setFilterMonth}
                filterType={filterType}
                setFilterType={setFilterType}
                filterAccount={filterAccount}
                setFilterAccount={setFilterAccount}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                riwayatStartDate={riwayatStartDate}
                setRiwayatStartDate={setRiwayatStartDate}
                riwayatEndDate={riwayatEndDate}
                setRiwayatEndDate={setRiwayatEndDate}
                displayMoney={displayMoney}
                openReconcile={openReconcile}
                handleExportCsv={handleExportCsv}
                onEditTx={(tx) => {
                  setEditingTx(tx);
                  setTxSheetOpen(true);
                }}
                confirmDeleteTxId={confirmDeleteTxId}
                setConfirmDeleteTxId={setConfirmDeleteTxId}
                busyAction={busyAction}
                handleDeleteTx={handleDeleteTx}
                hasMoreTransactions={Boolean(db.hasMoreTransactions)}
                loadingMoreTx={loadingMoreTx}
                isDemoMode={isDemoMode}
                onLoadMoreTransactions={() => void handleLoadMoreTransactions()}
              />
            )}

            {/* ================================================= */}
            {/* TAB 3: TABUNGAN                                   */}
            {/* ================================================= */}
            {activeTab === "tabungan" && (
              <GoalsTab
                goals={db.goals}
                accounts={db.accounts}
                categories={db.categories}
                recurring={extras.recurring}
                totalGoalsSaved={totalGoalsSaved}
                monthlyGoalDeposits={monthlyGoalDeposits}
                currentMonthPrefix={currentMonthPrefix}
                displayMoney={displayMoney}
                setDepositModalGoalId={setDepositModalGoalId}
                setGoalModalOpen={setGoalModalOpen}
                busyAction={busyAction}
                handleDeleteGoal={handleDeleteGoal}
                recName={recName}
                setRecName={setRecName}
                recType={recType}
                setRecType={setRecType}
                recCategory={recCategory}
                setRecCategory={setRecCategory}
                recAccountId={recAccountId}
                setRecAccountId={setRecAccountId}
                recAmountRaw={recAmountRaw}
                setRecAmountRaw={setRecAmountRaw}
                recDay={recDay}
                setRecDay={setRecDay}
                handleAddRecurring={handleAddRecurring}
                handleApplyRecurring={handleApplyRecurring}
                handleDeleteRecurring={handleDeleteRecurring}
              />
            )}

            {/* ================================================= */}
            {/* TAB 4: STATISTIK & TANYA GURI                     */}
            {/* ================================================= */}
            {activeTab === "statistik" && (
              <StatsTab
                categories={db.categories}
                monthlyBudget={db.settings.monthlyBudget}
                categoryBudgets={extras.categoryBudgets}
                availableMonths={availableMonths}
                formatMonthLabel={formatMonthLabel}
                statFilterMode={statFilterMode}
                setStatFilterMode={setStatFilterMode}
                statStartDate={statStartDate}
                setStatStartDate={setStatStartDate}
                statEndDate={statEndDate}
                setStatEndDate={setStatEndDate}
                statMetrics={statMetrics}
                statTrendYear={statTrendYear}
                allowance={allowance}
                hideNumbers={hideNumbers}
                displayMoney={displayMoney}
                onOpenBudgetSettings={() => openSheetsTab("atur")}
                budgetCatName={budgetCatName}
                setBudgetCatName={setBudgetCatName}
                budgetCatCapRaw={budgetCatCapRaw}
                setBudgetCatCapRaw={setBudgetCatCapRaw}
                handleSaveCategoryBudget={handleSaveCategoryBudget}
                handleDeleteCategoryBudget={handleDeleteCategoryBudget}
                askInput={askInput}
                setAskInput={setAskInput}
                askAnswer={askAnswer}
                askLoading={askLoading}
                handleAskGuri={handleAskGuri}
              />
            )}
          </div>
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar (5 slots, centered Maroon FAB) */}
      <nav
        aria-label="Navigasi bawah mobile"
        className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-[var(--nav-bg)] px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-1.5 backdrop-blur-md md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 items-center">
          {navItems.slice(0, 2).map(({ key, label, icon: Icon }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 text-[10px] font-bold sm:text-[11px] ${
                  active
                    ? "text-[var(--brand-primary)] dark:text-[#fda4af]"
                    : "text-[var(--text-muted)]"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </button>
            );
          })}

          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => openNewTx("manual", "Keluar")}
              aria-label="Catat transaksi baru"
              className="-mt-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-primary)] text-white shadow-lg ring-4 ring-[var(--bg-canvas)] hover:bg-[var(--brand-hover)]"
            >
              <PlusIcon className="h-6 w-6" />
            </button>
          </div>

          {navItems.slice(2).map(({ key, label, icon: Icon }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 text-[10px] font-bold sm:text-[11px] ${
                  active
                    ? "text-[var(--brand-primary)] dark:text-[#fda4af]"
                    : "text-[var(--text-muted)]"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Sheets & Modals */}
      <TransactionSheet
        open={txSheetOpen}
        initialTab={txSheetInitialTab}
        initialType={txSheetInitialType}
        initialAccountId={txSheetInitialAccountId}
        editingTx={editingTx}
        accounts={db.accounts}
        balances={accountBalanceMap}
        categories={db.categories}
        categoryTxCounts={categoryUsageCounts}
        onClose={() => {
          setTxSheetOpen(false);
          setEditingTx(null);
          setTxSheetInitialAccountId(undefined);
        }}
        onSaveSingle={handleSaveSingle}
        onSaveBatch={handleSaveBatch}
        onAddCategory={handleAddCategory}
        onUpdateCategory={handleUpdateCategory}
        onDeleteCategory={handleDeleteCategory}
        onReorderCategories={handleReorderCategories}
      />

      <KoreksiSaldoModal
        open={reconcileOpen}
        initialAccountId={reconcileAccountId}
        accounts={accountBalances}
        onClose={() => setReconcileOpen(false)}
        onSubmitReconcile={handleSubmitReconcile}
      />

      <SheetsDrawer
        open={sheetsOpen}
        initialTab={sheetsInitialTab}
        isDemoMode={isDemoMode}
        db={db}
        themeColor={themeColor}
        onChangeTheme={handleChangeTheme}
        onClose={() => setSheetsOpen(false)}
        onStateUpdated={setDb}
        onSaveSettings={handleSaveSettings}
        onAddAccount={handleAddAccount}
        onDeleteAccount={handleDeleteAccount}
        onClearAll={handleClearAll}
        onTriggerSync={triggerBackgroundSync}
        onNotify={showToast}
        recurring={extras.recurring}
      />

      {/* Rumus Jatah Harian Modal */}
      {formulaModalOpen &&
        (() => {
          const spentBeforeToday = Math.max(
            0,
            allowance.spentInCycle - allowance.spentToday,
          );
          const formatShortDate = (iso: string) => {
            const [y, m, d] = iso.split("-");
            const months = [
              "Jan",
              "Feb",
              "Mar",
              "Apr",
              "Mei",
              "Jun",
              "Jul",
              "Agu",
              "Sep",
              "Okt",
              "Nov",
              "Des",
            ];
            const mName = months[(parseInt(m, 10) || 1) - 1] ?? m;
            return `${parseInt(d, 10) || d} ${mName} ${y}`;
          };
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[rgba(0,0,0,0.55)] p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="formula-title"
              onClick={(e) => {
                if (e.target === e.currentTarget) setFormulaModalOpen(false);
              }}
            >
              <div className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-2xl">
                <div className="flex items-center justify-between gap-3">
                  <h2
                    id="formula-title"
                    className="text-base font-extrabold text-[var(--text-primary)]"
                  >
                    Cara Hitung Jatah Harian
                  </h2>
                  <button
                    type="button"
                    onClick={() => setFormulaModalOpen(false)}
                    aria-label="Tutup rumus"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-soft)]"
                  >
                    <CloseIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-3 space-y-3 text-xs leading-relaxed text-[var(--text-primary)] tabular-nums">
                  <div className="rounded-xl bg-[var(--bg-canvas)] p-3">
                    <span className="font-bold">Rumus:</span>{" "}
                    <span className="text-[var(--text-muted)]">
                      (Target Budget &minus; Pengeluaran sebelum hari ini)
                      &divide; Sisa hari di siklus
                    </span>
                  </div>

                  <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] p-3.5">
                    <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2 text-[11px] text-[var(--text-muted)]">
                      <span>Periode siklus aktif</span>
                      <span className="shrink-0 whitespace-nowrap font-bold text-[var(--text-primary)]">
                        {formatShortDate(allowance.cycleStart)} &ndash;{" "}
                        {formatShortDate(allowance.cycleEnd)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[var(--text-muted)]">
                        Target anggaran siklus
                      </span>
                      <strong className="shrink-0 whitespace-nowrap text-right">
                        {formatRupiah(db.settings.monthlyBudget)}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[var(--text-muted)]">
                        Terpakai sebelum hari ini
                      </span>
                      <strong className="shrink-0 whitespace-nowrap text-right">
                        {formatRupiah(spentBeforeToday)}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[var(--text-muted)]">
                        Sisa hari di siklus
                      </span>
                      <strong className="shrink-0 whitespace-nowrap text-right">
                        {allowance.daysLeftInCycle} hari
                      </strong>
                    </div>

                    <div className="flex items-center justify-between gap-4 border-t border-[var(--border-subtle)] pt-2">
                      <span className="font-extrabold">
                        Jatah aman hari ini
                      </span>
                      <strong className="shrink-0 whitespace-nowrap text-right text-sm font-extrabold text-[var(--brand-primary)] dark:text-[#fda4af]">
                        {formatRupiah(allowance.dailyAllowance)}
                      </strong>
                    </div>

                    {allowance.spentToday > 0 && (
                      <div className="space-y-1.5 border-t border-dashed border-[var(--border-subtle)] pt-2">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-[var(--text-muted)]">
                            Terpakai hari ini
                          </span>
                          <strong className="shrink-0 whitespace-nowrap text-right">
                            {formatRupiah(allowance.spentToday)}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="font-bold text-[var(--text-muted)]">
                            Sisa jatah hari ini
                          </span>
                          <strong
                            className={`shrink-0 whitespace-nowrap text-right ${
                              allowance.remainingToday < 0
                                ? "text-[var(--expense-text)]"
                                : "text-[var(--income-text)]"
                            }`}
                          >
                            {formatRupiah(allowance.remainingToday)}
                          </strong>
                        </div>
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-[var(--text-muted)]">
                    Jika pengeluaran hari ini di bawah jatah harian, sisa uang
                    otomatis dibagi ulang sehingga jatah besok naik.
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Target Baru Modal */}
      {goalModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[rgba(0,0,0,0.55)] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="goal-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setGoalModalOpen(false);
          }}
        >
          <form
            onSubmit={handleCreateGoal}
            className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2
                id="goal-modal-title"
                className="text-base font-extrabold text-[var(--text-primary)]"
              >
                Buat Target Tabungan
              </h2>
              <button
                type="button"
                onClick={() => setGoalModalOpen(false)}
                aria-label="Tutup form target"
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-soft)]"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label
                htmlFor="goal-name"
                className="mb-1 block text-xs font-bold text-[var(--text-muted)]"
              >
                Nama Target
              </label>
              <input
                id="goal-name"
                type="text"
                required
                value={goalName}
                onChange={(e) => setGoalName(e.target.value)}
                placeholder="Contoh: Dana Darurat"
                className="min-h-[44px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-sm text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label
                htmlFor="goal-target"
                className="mb-1 block text-xs font-bold text-[var(--text-muted)]"
              >
                Nominal Target (Rp)
              </label>
              <input
                id="goal-target"
                type="text"
                inputMode="numeric"
                required
                value={
                  goalTargetRaw
                    ? (parseInt(goalTargetRaw, 10) || 0).toLocaleString("id-ID")
                    : ""
                }
                onChange={(e) =>
                  setGoalTargetRaw(e.target.value.replace(/\D/g, ""))
                }
                placeholder="10.000.000"
                className="min-h-[44px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] tabular-nums"
              />
            </div>

            {modalError && (
              <p
                role="alert"
                className="rounded-xl bg-[var(--expense-bg)] px-3 py-2 text-xs font-bold text-[var(--expense-text)]"
              >
                {modalError}
              </p>
            )}

            <button
              type="submit"
              disabled={busyAction}
              className="min-h-[46px] w-full rounded-xl bg-[var(--brand-primary)] text-sm font-extrabold text-white hover:bg-[var(--brand-hover)]"
            >
              Simpan Target
            </button>
          </form>
        </div>
      )}

      {/* Setor Tabungan Modal */}
      {depositModalGoalId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[rgba(0,0,0,0.55)] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deposit-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDepositModalGoalId(null);
          }}
        >
          <form
            onSubmit={handleDepositGoal}
            className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2
                id="deposit-modal-title"
                className="text-base font-extrabold text-[var(--text-primary)]"
              >
                Setor Tabungan
              </h2>
              <button
                type="button"
                onClick={() => setDepositModalGoalId(null)}
                aria-label="Tutup form setor"
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-soft)]"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label
                htmlFor="deposit-goal"
                className="mb-1 block text-xs font-bold text-[var(--text-muted)]"
              >
                Pilih Target
              </label>
              <select
                id="deposit-goal"
                value={depositModalGoalId}
                onChange={(e) => setDepositModalGoalId(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-sm font-bold text-[var(--text-primary)]"
              >
                {db.goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({formatRupiah(g.currentAmount)} /{" "}
                    {formatRupiah(g.targetAmount)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="deposit-amount"
                className="mb-1 block text-xs font-bold text-[var(--text-muted)]"
              >
                Nominal Setoran (Rp)
              </label>
              <input
                id="deposit-amount"
                type="text"
                inputMode="numeric"
                required
                value={
                  depositRaw
                    ? (parseInt(depositRaw, 10) || 0).toLocaleString("id-ID")
                    : ""
                }
                onChange={(e) =>
                  setDepositRaw(e.target.value.replace(/\D/g, ""))
                }
                placeholder="200.000"
                className="min-h-[44px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] tabular-nums"
              />
            </div>

            <div>
              <label
                htmlFor="deposit-acc"
                className="mb-1 block text-xs font-bold text-[var(--text-muted)]"
              >
                Sumber Dana
              </label>
              <select
                id="deposit-acc"
                value={depositAccountId}
                onChange={(e) => setDepositAccountId(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-sm font-bold text-[var(--text-primary)]"
              >
                {db.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({displayMoney(accountBalanceMap[a.id] ?? 0)})
                  </option>
                ))}
              </select>
            </div>

            {(parseInt(depositRaw.replace(/\D/g, ""), 10) || 0) >
              (accountBalanceMap[depositAccountId] ?? 0) && (
              <p
                role="status"
                className="rounded-xl bg-[#FEF3C7] px-3 py-2 text-xs font-semibold text-[#92400E] dark:bg-[#451A03] dark:text-[#FDE68A]"
              >
                Saldo{" "}
                {db.accounts.find((a) => a.id === depositAccountId)?.name ??
                  "akun ini"}{" "}
                tercatat{" "}
                {displayMoney(accountBalanceMap[depositAccountId] ?? 0)}.
                Setelah setor ini saldonya menjadi minus.
              </p>
            )}

            {modalError && (
              <p
                role="alert"
                className="rounded-xl bg-[var(--expense-bg)] px-3 py-2 text-xs font-bold text-[var(--expense-text)]"
              >
                {modalError}
              </p>
            )}

            <button
              type="submit"
              disabled={busyAction}
              className="min-h-[46px] w-full rounded-xl bg-[var(--brand-primary)] text-sm font-extrabold text-white hover:bg-[var(--brand-hover)]"
            >
              Simpan Setoran
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
