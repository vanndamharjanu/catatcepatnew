"use client";

import React, { useEffect, useRef, useState } from "react";
import { formatRupiah, toIsoDate } from "@/lib/finance";
import type {
  Account,
  CategoryItem,
  ParsedTransactionDraft,
  Transaction,
  TransactionType,
} from "@/lib/types";
import {
  ArrowInIcon,
  ArrowOutIcon,
  CameraIcon,
  CATEGORY_ICON_OPTIONS,
  CategoryIcon,
  CloseIcon,
  GripIcon,
  MicIcon,
  TransferIcon,
} from "./Icons";
import { OctopusMascot } from "./OctopusMascot";

export interface TransactionFormProps {
  active?: boolean;
  inline?: boolean;
  initialTab?: "manual" | "ai";
  initialType?: TransactionType;
  initialAccountId?: string;
  editingTx?: Transaction | null;
  accounts: Account[];
  /** Current balance per account id, used to warn before a balance goes negative. */
  balances?: Record<string, number>;
  categories: CategoryItem[];
  /** Transaction count per `${type}:${category}` key, used when confirming deletion. */
  categoryTxCounts?: Record<string, number>;
  onSaved?: () => void;
  onSaveSingle: (payload: {
    id?: string;
    date: string;
    type: TransactionType;
    category: string;
    accountId: string;
    toAccountId?: string;
    amount: number;
    note: string;
  }) => Promise<void>;
  onSaveBatch: (drafts: ParsedTransactionDraft[]) => Promise<void>;
  onAddCategory: (name: string, type: "Masuk" | "Keluar", iconKey: string) => Promise<void>;
  onUpdateCategory: (
    id: string,
    updates: { name?: string; iconKey?: string },
  ) => Promise<void>;
  onDeleteCategory: (id: string, replacementCategory?: string) => Promise<void>;
  onReorderCategories: (type: "Masuk" | "Keluar", orderedIds: string[]) => Promise<void>;
}

const QUICK_AMOUNTS = [
  { label: "+500", value: 500 },
  { label: "+1rb", value: 1_000 },
  { label: "+2rb", value: 2_000 },
  { label: "+5rb", value: 5_000 },
  { label: "+10rb", value: 10_000 },
  { label: "+20rb", value: 20_000 },
  { label: "+50rb", value: 50_000 },
  { label: "+100rb", value: 100_000 },
  { label: "+500rb", value: 500_000 },
];

const AI_EXAMPLES = [
  "Makan siang 25rb pake gopay",
  "Bensin 50rb cash",
  "Ngopi 20rb cash, parkir 2rb cash",
];

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

/** Shared compact 1-screen transaction form rendered both inline on Catat tab and inside edit modals. */
export function TransactionForm({
  active = true,
  inline = false,
  initialTab = "manual",
  initialType = "Keluar",
  initialAccountId,
  editingTx = null,
  accounts,
  balances,
  categories,
  categoryTxCounts,
  onSaved,
  onSaveSingle,
  onSaveBatch,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onReorderCategories,
}: TransactionFormProps) {
  const idPrefix = inline ? "inline-" : "modal-";
  const [mode, setMode] = useState<"manual" | "ai">(initialTab);
  const [txType, setTxType] = useState<TransactionType>(initialType);
  const [amountRaw, setAmountRaw] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [date, setDate] = useState<string>(toIsoDate());
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id || "acc-cash");
  const [toAccountId, setToAccountId] = useState<string>(accounts[1]?.id || "acc-bank");
  const [note, setNote] = useState<string>("");

  // Category dropdown & manager inline state
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const [managingCats, setManagingCats] = useState(false);
  const catDropdownRef = useRef<HTMLDivElement | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const [newCatIcon, setNewCatIcon] = useState("tag");
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);
  const [replacementCat, setReplacementCat] = useState("");
  const [catBusy, setCatBusy] = useState(false);
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // AI & Voice state
  const [aiText, setAiText] = useState("");
  const [aiDrafts, setAiDrafts] = useState<ParsedTransactionDraft[]>([]);
  const [aiEngine, setAiEngine] = useState<string | null>(null);
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const wasActiveRef = useRef(false);
  const prevEditIdRef = useRef<string | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const didDragRef = useRef(false);
  const onReorderRef = useRef(onReorderCategories);
  onReorderRef.current = onReorderCategories;

  const filteredCats = categories.filter(
    (c) => c.type === (txType === "Masuk" ? "Masuk" : "Keluar"),
  );
  const displayedCats = dragIds
    ? dragIds
        .map((id) => filteredCats.find((c) => c.id === id))
        .filter((c): c is CategoryItem => Boolean(c))
    : filteredCats;
  const editingCat = editingCatId ? filteredCats.find((c) => c.id === editingCatId) ?? null : null;
  const deletingCat = deletingCatId ? filteredCats.find((c) => c.id === deletingCatId) ?? null : null;
  const deletingOtherCats = deletingCat
    ? filteredCats.filter((c) => c.id !== deletingCat.id)
    : [];
  const deletingTxCount = deletingCat
    ? categoryTxCounts?.[`${deletingCat.type}:${deletingCat.name}`] ?? 0
    : 0;

  // Initialize fields when modal opens or editingTx changes
  useEffect(() => {
    if (!active) {
      wasActiveRef.current = false;
      prevEditIdRef.current = null;
      recognitionRef.current?.stop();
      return;
    }
    const currentEditId = editingTx?.id ?? null;
    if (wasActiveRef.current && prevEditIdRef.current === currentEditId) return;
    wasActiveRef.current = true;
    prevEditIdRef.current = currentEditId;

    setFormError(null);
    setAiError(null);
    setCatDropdownOpen(false);
    setManagingCats(false);
    setNewCatName("");
    setNewCatIcon("tag");
    setEditingCatId(null);
    setEditCatName("");
    setDeletingCatId(null);
    setReplacementCat("");
    if (editingTx) {
      setMode("manual");
      setTxType(editingTx.type);
      setAmountRaw(String(editingTx.amount));
      setCategory(editingTx.category);
      setDate(editingTx.date);
      setAccountId(editingTx.accountId);
      setToAccountId(editingTx.toAccountId || accounts[1]?.id || "acc-bank");
      setNote(editingTx.note);
    } else {
      setMode(initialTab);
      setTxType(initialType);
      setAmountRaw("");
      const firstCat = categories.find(
        (c) => c.type === (initialType === "Masuk" ? "Masuk" : "Keluar"),
      );
      setCategory(firstCat?.name || "Lain-lain");
      setDate(toIsoDate());
      setAccountId(initialAccountId || accounts[0]?.id || "acc-cash");
      setToAccountId(accounts[1]?.id || "acc-bank");
      setNote("");
      setAiDrafts([]);
      setAiEngine(null);
      setAiWarning(null);
    }
  }, [active, editingTx, initialTab, initialType, initialAccountId, accounts, categories]);

  // Clear category edit/delete state when switching transaction type
  useEffect(() => {
    setCatDropdownOpen(false);
    setEditingCatId(null);
    setEditCatName("");
    setDeletingCatId(null);
    setReplacementCat("");
    setDragIds(null);
    setActiveDragId(null);
  }, [txType]);

  // Close category icon dropdown when clicking outside or pressing Escape
  useEffect(() => {
    if (!catDropdownOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (catDropdownRef.current && !catDropdownRef.current.contains(e.target as Node)) {
        setCatDropdownOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCatDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [catDropdownOpen]);

  // Ensure window pointer listeners are cleaned up on unmount or leaving manage mode
  useEffect(() => {
    if (!active || !managingCats) {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
      setDragIds(null);
      setActiveDragId(null);
    }
    return () => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
    };
  }, [active, managingCats]);

  // Keep selected category aligned when toggling Keluar <-> Masuk or presets
  useEffect(() => {
    if (txType === "Transfer") return;
    if (!filteredCats.some((c) => c.name === category)) {
      setCategory(filteredCats[0]?.name || "Lain-lain");
    }
  }, [txType, filteredCats, category]);

  const numericAmount = parseInt(amountRaw.replace(/\D/g, ""), 10) || 0;

  let effectiveBalance = balances?.[accountId];
  if (effectiveBalance !== undefined && editingTx) {
    if (editingTx.accountId === accountId) {
      if (editingTx.type === "Keluar" || editingTx.type === "Transfer") {
        effectiveBalance += editingTx.amount;
      } else if (editingTx.type === "Masuk") {
        effectiveBalance -= editingTx.amount;
      }
    } else if (editingTx.type === "Transfer" && editingTx.toAccountId === accountId) {
      effectiveBalance -= editingTx.amount;
    }
  }
  const goesNegative =
    (txType === "Keluar" || txType === "Transfer") &&
    effectiveBalance !== undefined &&
    numericAmount > 0 &&
    numericAmount > effectiveBalance;
  const sourceAccountName = accounts.find((a) => a.id === accountId)?.name ?? "akun ini";

  const aiNegativeAccounts: Array<{ name: string; projected: number }> = [];
  if (balances && aiDrafts.length > 0) {
    const projected: Record<string, number> = { ...balances };
    for (const draft of aiDrafts) {
      if (draft.type === "Masuk") {
        projected[draft.accountId] = (projected[draft.accountId] ?? 0) + draft.amount;
      } else if (draft.type === "Keluar") {
        projected[draft.accountId] = (projected[draft.accountId] ?? 0) - draft.amount;
      } else if (draft.type === "Transfer") {
        projected[draft.accountId] = (projected[draft.accountId] ?? 0) - draft.amount;
        if (draft.toAccountId) {
          projected[draft.toAccountId] = (projected[draft.toAccountId] ?? 0) + draft.amount;
        }
      }
    }
    for (const acc of accounts) {
      const nextBal = projected[acc.id];
      if (nextBal !== undefined && nextBal < 0 && nextBal < (balances[acc.id] ?? 0)) {
        aiNegativeAccounts.push({ name: acc.name, projected: nextBal });
      }
    }
  }

  const handleQuickAdd = (delta: number) => {
    setAmountRaw(String(numericAmount + delta));
    setFormError(null);
  };

  const handleCreateCategory = async () => {
    const name = newCatName.trim();
    if (!name || catBusy) return;
    setCatBusy(true);
    try {
      await onAddCategory(name, txType === "Masuk" ? "Masuk" : "Keluar", newCatIcon);
      setCategory(name);
      setNewCatName("");
      setNewCatIcon("tag");
      setFormError(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Gagal menambah kategori.");
    } finally {
      setCatBusy(false);
    }
  };

  const handleRenameCategory = async () => {
    if (!editingCat || catBusy) return;
    const trimmed = editCatName.trim();
    if (!trimmed) {
      setFormError("Nama kategori wajib diisi.");
      return;
    }
    setCatBusy(true);
    try {
      const oldName = editingCat.name;
      await onUpdateCategory(editingCat.id, { name: trimmed });
      if (category === oldName) setCategory(trimmed);
      setFormError(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Gagal mengubah nama kategori.");
    } finally {
      setCatBusy(false);
    }
  };

  const handleConfirmDeleteCategory = async () => {
    if (!deletingCat || catBusy) return;
    setCatBusy(true);
    try {
      const targetName = deletingTxCount > 0 ? replacementCat : undefined;
      await onDeleteCategory(deletingCat.id, targetName);
      if (category === deletingCat.name) {
        setCategory(targetName || deletingOtherCats[0]?.name || "Lain-lain");
      }
      setDeletingCatId(null);
      setFormError(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Gagal menghapus kategori.");
    } finally {
      setCatBusy(false);
    }
  };

  const startCategoryDrag = (e: React.PointerEvent, catId: string, fromHandle: boolean) => {
    if (!managingCats || catBusy || filteredCats.length <= 1) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (fromHandle) e.stopPropagation();

    dragCleanupRef.current?.();
    const catType: "Masuk" | "Keluar" = txType === "Masuk" ? "Masuk" : "Keluar";
    const originalOrder = filteredCats.map((c) => c.id);
    const state = {
      id: catId,
      startX: e.clientX,
      startY: e.clientY,
      active: fromHandle,
      order: [...originalOrder],
    };

    didDragRef.current = false;
    let holdTimer: number | null = null;
    if (fromHandle) {
      setActiveDragId(catId);
      setDragIds(state.order);
    } else if (e.pointerType !== "mouse") {
      holdTimer = window.setTimeout(() => {
        holdTimer = null;
        if (state.active) return;
        state.active = true;
        didDragRef.current = true;
        setActiveDragId(catId);
        setDragIds([...state.order]);
      }, 220);
    }

    const onMove = (ev: PointerEvent) => {
      if (!state.active) {
        const dist = Math.hypot(ev.clientX - state.startX, ev.clientY - state.startY);
        if (ev.pointerType !== "mouse") {
          if (dist > 8) cleanup(false);
          return;
        }
        if (dist <= 6) return;
        state.active = true;
        didDragRef.current = true;
        setActiveDragId(catId);
        setDragIds([...state.order]);
      }

      if (ev.cancelable) ev.preventDefault();
      const target = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest<HTMLElement>("[data-cat-id]");
      const overId = target?.dataset.catId;
      if (!overId || overId === state.id) return;

      const fromIdx = state.order.indexOf(state.id);
      const toIdx = state.order.indexOf(overId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

      const next = [...state.order];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      state.order = next;
      didDragRef.current = true;
      setDragIds(next);
    };

    const cleanup = (commit: boolean) => {
      if (holdTimer !== null) {
        window.clearTimeout(holdTimer);
        holdTimer = null;
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      dragCleanupRef.current = null;
      setActiveDragId(null);

      if (!commit || !state.active) {
        setDragIds(null);
        return;
      }

      if (didDragRef.current) {
        window.setTimeout(() => {
          didDragRef.current = false;
        }, 0);
      }

      const changed = state.order.some((id, idx) => id !== originalOrder[idx]);
      if (!changed) {
        setDragIds(null);
        return;
      }

      setCatBusy(true);
      void onReorderRef
        .current(catType, state.order)
        .then(() => setFormError(null))
        .catch((err) => {
          setFormError(err instanceof Error ? err.message : "Gagal menyimpan urutan kategori.");
        })
        .finally(() => {
          setDragIds(null);
          setCatBusy(false);
        });
    };

    const onUp = () => cleanup(true);
    const onCancel = () => cleanup(false);

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    dragCleanupRef.current = () => cleanup(false);
  };

  const todayIso = toIsoDate();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayIso = toIsoDate(yesterdayDate);

  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numericAmount <= 0) {
      setFormError("Masukkan nominal transaksi lebih dari Rp 0.");
      return;
    }
    if (txType === "Transfer" && accountId === toAccountId) {
      setFormError("Pilih akun tujuan transfer yang berbeda dari akun asal.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await onSaveSingle({
        id: editingTx?.id,
        date,
        type: txType,
        category: txType === "Transfer" ? "Transfer Akun" : category,
        accountId,
        toAccountId: txType === "Transfer" ? toAccountId : undefined,
        amount: numericAmount,
        note,
      });
      if (inline && !editingTx) {
        setAmountRaw("");
        setNote("");
      }
      onSaved?.();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Gagal menyimpan transaksi.");
    } finally {
      setSaving(false);
    }
  };

  const runAiParse = async (opts?: { imageBase64?: string; mimeType?: string }) => {
    if (!opts?.imageBase64 && !aiText.trim()) {
      setAiError("Ketik atau ucapkan transaksi terlebih dahulu.");
      return;
    }
    setAiBusy(true);
    setAiError(null);
    setAiWarning(null);
    try {
      const res = await fetch("/api/ai/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "parse",
          text: opts?.imageBase64 ? "" : aiText,
          imageBase64: opts?.imageBase64,
          mimeType: opts?.mimeType,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        drafts?: ParsedTransactionDraft[];
        engine?: string;
        warning?: string;
        error?: string;
      };
      if (!res.ok || !data.drafts) {
        setAiError(data.error || "Belum ada transaksi yang terbaca.");
        setAiDrafts([]);
        return;
      }
      setAiDrafts(data.drafts);
      setAiEngine(data.engine || "otomatis");
      setAiWarning(data.warning || null);
    } catch {
      setAiError("Gagal memproses catatan otomatis. Coba ulangi.");
    } finally {
      setAiBusy(false);
    }
  };

  const handleVoiceToggle = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRec) {
      setAiError(
        "Browser ini belum mendukung dikte suara. Silakan ketik transaksi di kolom di bawah atau gunakan Chrome/Edge.",
      );
      return;
    }

    setAiError(null);
    const rec = new SpeechRec();
    rec.lang = "id-ID";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      const spoken = event.results[0]?.[0]?.transcript || "";
      if (spoken) {
        setAiText((prev) => (prev ? `${prev}, ${spoken}` : spoken));
      }
    };
    rec.onerror = () => {
      setListening(false);
      setAiError("Mikrofon tidak dapat diakses atau izin ditolak.");
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  const handleReceiptSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.split(",")[1];
      if (base64) {
        void runAiParse({ imageBase64: base64, mimeType: file.type || "image/jpeg" });
      }
    };
    reader.onerror = () => setAiError("Gagal membaca file gambar struk.");
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSaveAllDrafts = async () => {
    if (aiDrafts.length === 0) return;
    setSaving(true);
    try {
      await onSaveBatch(aiDrafts);
      if (inline) {
        setAiText("");
        setAiDrafts([]);
        setAiWarning(null);
      }
      onSaved?.();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Gagal menyimpan daftar transaksi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {inline && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2.5">
          <h2 className="text-sm font-extrabold text-[var(--text-primary)]">
            Catat Transaksi
          </h2>
          <div className="flex rounded-xl bg-[var(--bg-soft)] p-0.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => setMode("manual")}
              className={`rounded-lg px-2.5 py-1 transition-colors ${
                mode === "manual"
                  ? "bg-[var(--brand-primary)] text-white"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              Manual
            </button>
            <button
              type="button"
              onClick={() => setMode("ai")}
              className={`rounded-lg px-2.5 py-1 transition-colors ${
                mode === "ai"
                  ? "bg-[var(--brand-primary)] text-white"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              Suara / Struk
            </button>
          </div>
        </div>
      )}

      {!inline && !editingTx && (
        <div className="mb-3 flex rounded-xl bg-[var(--bg-soft)] p-1 text-xs font-bold">
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`min-h-[38px] flex-1 rounded-lg transition-colors ${
              mode === "manual"
                ? "bg-[var(--brand-primary)] text-white"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            Input Manual
          </button>
          <button
            type="button"
            onClick={() => setMode("ai")}
            className={`min-h-[38px] flex-1 rounded-lg transition-colors ${
              mode === "ai"
                ? "bg-[var(--brand-primary)] text-white"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            Suara / Teks / Struk
          </button>
        </div>
      )}

      {mode === "manual" ? (
        <form onSubmit={handleSubmitManual} className="flex flex-1 flex-col gap-3">
          {/* Type toggle */}
          <div
            className="grid grid-cols-3 gap-1.5 rounded-xl bg-[var(--bg-soft)] p-1"
            role="tablist"
            aria-label="Jenis transaksi"
          >
            {(
              [
                { key: "Keluar", label: "Keluar", icon: ArrowOutIcon },
                { key: "Masuk", label: "Masuk", icon: ArrowInIcon },
                { key: "Transfer", label: "Transfer", icon: TransferIcon },
              ] as const
            ).map(({ key, label, icon: Icon }) => {
              const activeTab = txType === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab}
                  onClick={() => setTxType(key)}
                  className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab
                      ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Compact Date + Account side-by-side */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <div className="mb-1 flex items-center justify-between gap-1">
                <label
                  htmlFor={`${idPrefix}tx-date`}
                  className="text-xs font-bold text-[var(--text-muted)]"
                >
                  Tanggal
                </label>
                <button
                  type="button"
                  onClick={() => setDate(date === yesterdayIso ? todayIso : yesterdayIso)}
                  className="text-[11px] font-bold text-[var(--brand-primary)] hover:underline dark:text-[#fda4af]"
                >
                  {date === yesterdayIso ? "Hari ini" : "Kemarin"}
                </button>
              </div>
              <input
                id={`${idPrefix}tx-date`}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 text-xs font-bold text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label
                htmlFor={`${idPrefix}tx-account`}
                className="mb-1 block text-xs font-bold text-[var(--text-muted)]"
              >
                {txType === "Transfer" ? "Dari Akun" : "Akun"}
              </label>
              <select
                id={`${idPrefix}tx-account`}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)]"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Category Dropdown OR Transfer Destination */}
          {txType === "Transfer" ? (
            <div>
              <label
                htmlFor={`${idPrefix}tx-to-account`}
                className="mb-1 block text-xs font-bold text-[var(--text-muted)]"
              >
                Ke Akun Tujuan
              </label>
              <select
                id={`${idPrefix}tx-to-account`}
                value={toAccountId}
                onChange={(e) => setToAccountId(e.target.value)}
                className="min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)]"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label
                  htmlFor={`${idPrefix}tx-category`}
                  className="text-xs font-bold text-[var(--text-muted)]"
                >
                  Kategori
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setCatDropdownOpen(false);
                    setManagingCats((v) => !v);
                    setEditingCatId(null);
                    setEditCatName("");
                    setDeletingCatId(null);
                  }}
                  className="text-xs font-bold text-[var(--brand-primary)] hover:underline dark:text-[#fda4af]"
                >
                  {managingCats ? "Selesai" : "Kelola kategori"}
                </button>
              </div>

              {(() => {
                const selectedCat =
                  filteredCats.find((c) => c.name === category) ?? filteredCats[0];
                return (
                  <div ref={catDropdownRef} className="relative">
                    <button
                      id={`${idPrefix}tx-category`}
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={catDropdownOpen}
                      onClick={() => setCatDropdownOpen((v) => !v)}
                      className="flex min-h-[42px] w-full items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]/50"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-soft)] text-[var(--brand-primary)] dark:text-[#fda4af]">
                          <CategoryIcon
                            iconKey={selectedCat?.iconKey || "tag"}
                            className="h-4 w-4"
                          />
                        </span>
                        <span className="truncate">
                          {selectedCat?.name || category || "Pilih kategori"}
                        </span>
                      </span>
                      <svg
                        className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${
                          catDropdownOpen ? "rotate-180" : ""
                        }`}
                        viewBox="0 0 20 20"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M5 7.5L10 12.5L15 7.5"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>

                    {catDropdownOpen && (
                      <div
                        role="listbox"
                        aria-label="Daftar kategori"
                        className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-60 overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2 shadow-xl"
                      >
                        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                          {filteredCats.map((cat) => {
                            const selected = cat.name === category;
                            return (
                              <button
                                key={cat.id}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                onClick={() => {
                                  setCategory(cat.name);
                                  setCatDropdownOpen(false);
                                }}
                                className={`flex min-h-[40px] w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-bold transition-colors ${
                                  selected
                                    ? "bg-[var(--brand-primary)] text-white"
                                    : "text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
                                }`}
                              >
                                <span
                                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                                    selected
                                      ? "bg-white/20 text-white"
                                      : "bg-[var(--bg-soft)] text-[var(--brand-primary)] dark:text-[#fda4af]"
                                  }`}
                                >
                                  <CategoryIcon iconKey={cat.iconKey} className="h-4 w-4" />
                                </span>
                                <span className="truncate">{cat.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Expandable Full Category Manager */}
              {managingCats && (
                <div className="mt-2.5 space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3">
                  {deletingCat ? (
                    <div className="space-y-2.5">
                      <p className="text-xs font-extrabold text-[var(--expense-text)]">
                        Hapus kategori &ldquo;{deletingCat.name}&rdquo;?
                      </p>
                      {deletingTxCount > 0 ? (
                        <div>
                          <label
                            htmlFor={`${idPrefix}replacement-cat-select`}
                            className="mb-1.5 block text-xs text-[var(--text-primary)]"
                          >
                            Dipakai di <strong>{deletingTxCount} catatan</strong>. Pindahkan ke:
                          </label>
                          <select
                            id={`${idPrefix}replacement-cat-select`}
                            value={replacementCat}
                            onChange={(e) => setReplacementCat(e.target.value)}
                            className="min-h-[40px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 text-xs font-bold text-[var(--text-primary)]"
                          >
                            {deletingOtherCats.map((c) => (
                              <option key={c.id} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <p className="text-xs text-[var(--text-muted)]">
                          Kategori ini belum dipakai.
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={catBusy}
                          onClick={handleConfirmDeleteCategory}
                          className="min-h-[38px] flex-1 rounded-xl bg-[#BE123C] px-3 text-xs font-bold text-white disabled:opacity-50"
                        >
                          {deletingTxCount > 0 ? "Pindahkan & Hapus" : "Ya, Hapus"}
                        </button>
                        <button
                          type="button"
                          disabled={catBusy}
                          onClick={() => setDeletingCatId(null)}
                          className="min-h-[38px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3.5 text-xs font-bold text-[var(--text-primary)]"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {editingCat ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <label
                              htmlFor={`${idPrefix}edit-cat-name`}
                              className="text-xs font-bold text-[var(--text-primary)]"
                            >
                              Edit Kategori
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCatId(null);
                                setEditCatName("");
                              }}
                              className="text-xs font-bold text-[var(--brand-primary)] hover:underline dark:text-[#fda4af]"
                            >
                              Tambah baru
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <input
                              id={`${idPrefix}edit-cat-name`}
                              type="text"
                              value={editCatName}
                              onChange={(e) => setEditCatName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void handleRenameCategory();
                                }
                              }}
                              placeholder="Nama kategori"
                              className="min-h-[40px] flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 text-xs text-[var(--text-primary)]"
                            />
                            <button
                              type="button"
                              disabled={
                                catBusy ||
                                !editCatName.trim() ||
                                editCatName.trim() === editingCat.name
                              }
                              onClick={handleRenameCategory}
                              className="rounded-xl bg-[var(--brand-primary)] px-3.5 text-xs font-bold text-white disabled:opacity-50"
                            >
                              Simpan
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label
                            htmlFor={`${idPrefix}new-cat-name`}
                            className="mb-1.5 block text-xs font-bold text-[var(--text-primary)]"
                          >
                            Tambah Kategori {txType}
                          </label>
                          <div className="flex gap-2">
                            <input
                              id={`${idPrefix}new-cat-name`}
                              type="text"
                              value={newCatName}
                              onChange={(e) => setNewCatName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void handleCreateCategory();
                                }
                              }}
                              placeholder="Nama kategori baru"
                              className="min-h-[40px] flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 text-xs text-[var(--text-primary)]"
                            />
                            <button
                              type="button"
                              disabled={catBusy || !newCatName.trim()}
                              onClick={handleCreateCategory}
                              className="rounded-xl bg-[var(--brand-primary)] px-3.5 text-xs font-bold text-white disabled:opacity-50"
                            >
                              Tambah
                            </button>
                          </div>
                        </div>
                      )}

                      <div>
                        <div className="mb-1.5 flex items-center justify-between text-[11px]">
                          <span className="font-bold text-[var(--text-muted)]">
                            {editingCat ? "Ikon baru:" : "Pilih ikon:"}
                          </span>
                          <span className="font-bold text-[var(--text-primary)]">
                            {CATEGORY_ICON_OPTIONS.find(
                              (o) => o.key === (editingCat ? editingCat.iconKey : newCatIcon),
                            )?.label ?? "Lain-lain"}
                          </span>
                        </div>
                        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
                          {CATEGORY_ICON_OPTIONS.map((opt) => {
                            const activeKey = editingCat ? editingCat.iconKey : newCatIcon;
                            const isPicked =
                              activeKey === opt.key ||
                              (activeKey === "piggy" && opt.key === "savings");
                            return (
                              <button
                                key={opt.key}
                                type="button"
                                disabled={catBusy}
                                title={opt.label}
                                aria-label={`Pilih ikon ${opt.label}`}
                                aria-pressed={isPicked}
                                onClick={async () => {
                                  if (editingCat) {
                                    setCatBusy(true);
                                    try {
                                      await onUpdateCategory(editingCat.id, { iconKey: opt.key });
                                      setFormError(null);
                                    } catch (err) {
                                      setFormError(
                                        err instanceof Error ? err.message : "Gagal mengubah ikon.",
                                      );
                                    } finally {
                                      setCatBusy(false);
                                    }
                                  } else {
                                    setNewCatIcon(opt.key);
                                  }
                                }}
                                className={`flex h-9 items-center justify-center rounded-xl border transition-colors ${
                                  isPicked
                                    ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                                    : "border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
                                }`}
                              >
                                <CategoryIcon iconKey={opt.key} className="h-4 w-4" />
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 select-none">
                        {displayedCats.map((cat) => {
                          const isEditingTile = editingCatId === cat.id;
                          const isDeletingTile = deletingCatId === cat.id;
                          const isDraggingTile = activeDragId === cat.id;
                          return (
                            <div
                              key={cat.id}
                              data-cat-id={cat.id}
                              className={`relative transition-transform ${
                                isDraggingTile ? "z-10 scale-[1.03]" : ""
                              }`}
                            >
                              <button
                                type="button"
                                onPointerDown={(e) => startCategoryDrag(e, cat.id, false)}
                                onClick={() => {
                                  if (didDragRef.current) {
                                    didDragRef.current = false;
                                    return;
                                  }
                                  setDeletingCatId(null);
                                  if (editingCatId === cat.id) {
                                    setEditingCatId(null);
                                    setEditCatName("");
                                  } else {
                                    setEditingCatId(cat.id);
                                    setEditCatName(cat.name);
                                  }
                                }}
                                className={`flex h-[74px] w-full cursor-grab flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center active:cursor-grabbing ${
                                  isDraggingTile
                                    ? "border-[var(--brand-primary)] bg-[var(--bg-soft)] shadow-md ring-2 ring-[var(--brand-primary)]"
                                    : isDeletingTile
                                      ? "border-[#BE123C] bg-[var(--expense-bg)]"
                                      : isEditingTile
                                        ? "border-dashed border-[var(--brand-primary)] bg-[var(--bg-soft)]"
                                        : "border-[var(--border-subtle)] bg-[var(--bg-card)]"
                                }`}
                              >
                                <span
                                  className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                                    isEditingTile || isDraggingTile
                                      ? "bg-[var(--brand-primary)] text-white"
                                      : "bg-[var(--bg-soft)] text-[var(--brand-primary)] dark:text-[#fda4af]"
                                  }`}
                                >
                                  <CategoryIcon iconKey={cat.iconKey} className="h-3.5 w-3.5" />
                                </span>
                                <span className="line-clamp-2 text-[11px] font-bold leading-tight text-[var(--text-primary)]">
                                  {cat.name}
                                </span>
                              </button>
                              {filteredCats.length > 1 && (
                                <span
                                  role="button"
                                  tabIndex={-1}
                                  aria-label={`Geser posisi ${cat.name}`}
                                  onPointerDown={(e) => startCategoryDrag(e, cat.id, true)}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ touchAction: "none" }}
                                  className="absolute left-0.5 top-0.5 flex h-6 w-5 cursor-grab items-center justify-center rounded-md text-[var(--text-muted)]"
                                >
                                  <GripIcon className="h-3.5 w-3.5" />
                                </span>
                              )}
                              {filteredCats.length > 1 && (
                                <button
                                  type="button"
                                  disabled={catBusy}
                                  aria-label={`Hapus kategori ${cat.name}`}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={() => {
                                    const others = filteredCats.filter((c) => c.id !== cat.id);
                                    const preferred =
                                      others.find((c) => c.name === "Lain-lain")?.name ||
                                      others[0]?.name ||
                                      "";
                                    setEditingCatId(null);
                                    setDeletingCatId(cat.id);
                                    setReplacementCat(preferred);
                                    setFormError(null);
                                  }}
                                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#BE123C] text-[11px] font-bold text-white shadow-xs disabled:opacity-50"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Nominal Input + 2x5 Quick Chips */}
          <div>
            <label
              htmlFor={`${idPrefix}tx-amount`}
              className="mb-1 block text-xs font-bold text-[var(--text-muted)]"
            >
              Nominal (Rp)
            </label>
            <div className="flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2 focus-within:border-[var(--brand-primary)] focus-within:ring-2 focus-within:ring-[var(--brand-ring)]">
              <span className="mr-2 text-base font-extrabold text-[var(--text-muted)]">Rp</span>
              <input
                id={`${idPrefix}tx-amount`}
                type="text"
                inputMode="numeric"
                value={numericAmount > 0 ? numericAmount.toLocaleString("id-ID") : ""}
                onChange={(e) => {
                  setAmountRaw(e.target.value.replace(/\D/g, ""));
                  setFormError(null);
                }}
                placeholder="0"
                className="w-full bg-transparent text-xl font-extrabold text-[var(--text-primary)] tabular-nums outline-none focus:outline-none focus-visible:outline-none"
              />
              {numericAmount > 0 && (
                <button
                  type="button"
                  onClick={() => setAmountRaw("")}
                  className="ml-2 rounded-lg bg-[var(--bg-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--brand-primary)] dark:text-[#fda4af]"
                >
                  Reset
                </button>
              )}
            </div>

            <div className="mt-1.5 grid grid-cols-5 gap-1.5">
              {QUICK_AMOUNTS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => handleQuickAdd(item.value)}
                  className="min-h-[36px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-1 text-[11px] font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAmountRaw("")}
                className="min-h-[36px] rounded-lg border border-[var(--border-subtle)] bg-[var(--expense-bg)] px-1 text-[11px] font-bold text-[var(--expense-text)] hover:opacity-90"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Note */}
          <div>
            <label
              htmlFor={`${idPrefix}tx-note`}
              className="mb-1 block text-xs font-bold text-[var(--text-muted)]"
            >
              Keterangan (opsional)
            </label>
            <input
              id={`${idPrefix}tx-note`}
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Contoh: Makan siang"
              className="min-h-[40px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-sm text-[var(--text-primary)]"
            />
          </div>

          {goesNegative && effectiveBalance !== undefined && (
            <p
              role="status"
              className="rounded-xl bg-[#FEF3C7] px-3 py-2 text-[11px] font-semibold text-[#92400E] dark:bg-[#451A03] dark:text-[#FDE68A]"
            >
              Saldo {sourceAccountName} akan jadi {formatRupiah(effectiveBalance - numericAmount)}. Atur
              saldo awal di Sheets &amp; Atur jika belum diisi.
            </p>
          )}

          {formError && (
            <p
              role="alert"
              className="rounded-xl bg-[var(--expense-bg)] px-3 py-2 text-xs font-bold text-[var(--expense-text)]"
            >
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="mt-auto min-h-[44px] w-full rounded-xl bg-[var(--brand-primary)] px-4 text-sm font-extrabold text-white hover:bg-[var(--brand-hover)] disabled:opacity-60"
          >
            {saving ? "Menyimpan..." : editingTx ? "Simpan Perubahan" : "Simpan Transaksi"}
          </button>
        </form>
      ) : (
        /* AI / Voice / Multi-Transaction Capture Mode */
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex items-center gap-3 rounded-xl bg-[var(--bg-soft)] p-3">
            <OctopusMascot mood="ai" size={44} className="shrink-0" />
            <div className="min-w-0">
              <h3 className="text-xs font-extrabold text-[var(--text-primary)]">
                Catat Cepat via Suara, Teks, atau Foto Struk
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Bisa tulis banyak transaksi sekaligus lalu simpan sekali klik.
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleReceiptSelected}
            className="hidden"
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={aiBusy}
              onClick={() => fileInputRef.current?.click()}
              className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)] disabled:opacity-60"
            >
              <CameraIcon className="h-4 w-4 text-[var(--brand-primary)] dark:text-[#fda4af]" />
              <span>{aiBusy ? "Membaca..." : "Foto Struk"}</span>
            </button>

            <button
              type="button"
              onClick={handleVoiceToggle}
              className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold text-white transition-colors ${
                listening
                  ? "bg-[#BE123C]"
                  : "bg-[var(--brand-primary)] hover:bg-[var(--brand-hover)]"
              }`}
            >
              <MicIcon className="h-4 w-4" />
              <span>{listening ? "Stop Rekam" : "Rekam Suara"}</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {AI_EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setAiText(ex)}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 py-1 text-left text-[11px] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
              >
                {ex}
              </button>
            ))}
          </div>

          <div>
            <label
              htmlFor={`${idPrefix}ai-text-input`}
              className="mb-1 block text-xs font-bold text-[var(--text-muted)]"
            >
              Teks Transaksi
            </label>
            <textarea
              id={`${idPrefix}ai-text-input`}
              rows={2}
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              placeholder="Contoh: Ngopi 20rb cash, bensin 50rb ovo"
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2.5 text-sm text-[var(--text-primary)]"
            />
          </div>

          {aiError && (
            <p
              role="alert"
              className="rounded-xl bg-[var(--expense-bg)] px-3 py-2 text-xs font-bold text-[var(--expense-text)]"
            >
              {aiError}
            </p>
          )}

          <button
            type="button"
            disabled={aiBusy}
            onClick={() => runAiParse()}
            className="min-h-[44px] w-full rounded-xl border-2 border-[var(--brand-primary)] bg-transparent text-xs font-extrabold text-[var(--brand-primary)] hover:bg-[var(--bg-soft)] disabled:opacity-60 dark:text-[#fda4af]"
          >
            {aiBusy ? "Memproses..." : "Analisa Catatan"}
          </button>

          {aiDrafts.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[var(--text-primary)]">
                  Terdeteksi {aiDrafts.length} transaksi
                </span>
                <span className="rounded-lg bg-[var(--bg-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-muted)]">
                  {aiEngine === "gemini" || aiEngine === "gateway" ? "Guri AI" : "Otomatis"}
                </span>
              </div>

              {aiWarning && (
                <p className="rounded-xl bg-[#FEF3C7] px-3 py-2 text-[11px] font-semibold text-[#92400E] dark:bg-[#451A03] dark:text-[#FDE68A]">
                  {aiWarning}
                </p>
              )}

              {aiDrafts.map((draft) => {
                const accName =
                  accounts.find((a) => a.id === draft.accountId)?.name || draft.accountId;
                return (
                  <div
                    key={draft.tempId}
                    className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-extrabold ${
                            draft.type === "Masuk"
                              ? "text-[var(--income-text)]"
                              : draft.type === "Keluar"
                                ? "text-[var(--expense-text)]"
                                : "text-[var(--text-primary)]"
                          }`}
                        >
                          {draft.type}
                        </span>
                        <span className="truncate text-xs font-bold text-[var(--text-primary)]">
                          {draft.category}
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)]">({accName})</span>
                      </div>
                      <p className="truncate text-[11px] text-[var(--text-muted)]">{draft.note}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs font-extrabold text-[var(--text-primary)] tabular-nums">
                        {formatRupiah(draft.amount)}
                      </span>
                      <button
                        type="button"
                        aria-label={`Hapus draft ${draft.note}`}
                        onClick={() =>
                          setAiDrafts((prev) => prev.filter((item) => item.tempId !== draft.tempId))
                        }
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--expense-bg)] text-xs font-bold text-[var(--expense-text)]"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}

              {aiNegativeAccounts.length > 0 && (
                <p
                  role="status"
                  className="rounded-xl bg-[#FEF3C7] px-3 py-2 text-[11px] font-semibold text-[#92400E] dark:bg-[#451A03] dark:text-[#FDE68A]"
                >
                  Saldo akan minus pada:{" "}
                  {aiNegativeAccounts.map((a) => `${a.name} (${formatRupiah(a.projected)})`).join(", ")}.
                </p>
              )}

              <button
                type="button"
                disabled={saving}
                onClick={handleSaveAllDrafts}
                className="min-h-[44px] w-full rounded-xl bg-[var(--brand-primary)] text-sm font-extrabold text-white hover:bg-[var(--brand-hover)] disabled:opacity-60"
              >
                {saving ? "Menyimpan..." : `Simpan Semua (${aiDrafts.length})`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface TransactionSheetProps extends Omit<TransactionFormProps, "active" | "inline" | "onSaved"> {
  open: boolean;
  onClose: () => void;
}

/** Modal wrapper around shared TransactionForm used for editing history rows or quick entry from other tabs. */
export function TransactionSheet({ open, onClose, ...formProps }: TransactionSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(0,0,0,0.55)] p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sheet-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="animate-sheet-up max-h-sheet flex w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3.5">
          <h2 id="sheet-title" className="text-base font-extrabold text-[var(--text-primary)]">
            {formProps.editingTx ? "Edit Transaksi" : "Catat Transaksi"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup jendela transaksi"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-soft)] hover:text-[var(--text-primary)]"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-6 pt-4">
          <TransactionForm active={open} inline={false} onSaved={onClose} {...formProps} />
        </div>
      </div>
    </div>
  );
}
