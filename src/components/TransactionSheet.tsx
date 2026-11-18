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

interface TransactionSheetProps {
  open: boolean;
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
  onClose: () => void;
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
  "Ngopi 20rb cash, parkir 2rb cash, gaji masuk bca 5jt",
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

export function TransactionSheet({
  open,
  initialTab = "manual",
  initialType = "Keluar",
  initialAccountId,
  editingTx = null,
  accounts,
  balances,
  categories,
  categoryTxCounts,
  onClose,
  onSaveSingle,
  onSaveBatch,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onReorderCategories,
}: TransactionSheetProps) {
  const [mode, setMode] = useState<"manual" | "ai">(initialTab);
  const [txType, setTxType] = useState<TransactionType>(initialType);
  const [amountRaw, setAmountRaw] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [date, setDate] = useState<string>(toIsoDate());
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id || "acc-cash");
  const [toAccountId, setToAccountId] = useState<string>(accounts[1]?.id || "acc-bank");
  const [note, setNote] = useState<string>("");

  // Category manager inline state
  const [managingCats, setManagingCats] = useState(false);
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
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const wasOpenRef = useRef(false);
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

  // Initialize fields only when opening or switching editingTx (so category updates don't reset inputs)
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      prevEditIdRef.current = null;
      return;
    }
    const currentEditId = editingTx?.id ?? null;
    if (wasOpenRef.current && prevEditIdRef.current === currentEditId) return;
    wasOpenRef.current = true;
    prevEditIdRef.current = currentEditId;

    setFormError(null);
    setAiError(null);
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
    }
  }, [open, editingTx, initialTab, initialType, initialAccountId, accounts, categories]);

  // Clear category edit/delete state when switching transaction type
  useEffect(() => {
    setEditingCatId(null);
    setEditCatName("");
    setDeletingCatId(null);
    setReplacementCat("");
    setDragIds(null);
    setActiveDragId(null);
  }, [txType]);

  // Ensure window pointer listeners are cleaned up on close, unmount, or leaving manage mode
  useEffect(() => {
    if (!open || !managingCats) {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
      setDragIds(null);
      setActiveDragId(null);
    }
    return () => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
    };
  }, [open, managingCats]);

  // Keep selected category aligned when toggling Keluar <-> Masuk
  useEffect(() => {
    if (txType === "Transfer") return;
    if (!filteredCats.some((c) => c.name === category)) {
      setCategory(filteredCats[0]?.name || "Lain-lain");
    }
  }, [txType, filteredCats, category]);

  // Escape key closes sheet (R-32)
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        recognitionRef.current?.stop();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const numericAmount = parseInt(amountRaw.replace(/\D/g, ""), 10) || 0;

  // When editing, adjust out the original transaction's effect before checking the updated balance.
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

  // Check if the batch of AI drafts would pull any account balance below zero.
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
      const targetName =
        deletingTxCount > 0 ? replacementCat : undefined;
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
      // Allow touch press-and-hold on the card body ("cubit terus geser") without blocking quick scroll swipes.
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
        .then(() => {
          setFormError(null);
        })
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
      onClose();
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
    try {
      const res = await fetch("/api/ai/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "parse",
          text: aiText,
          imageBase64: opts?.imageBase64,
          mimeType: opts?.mimeType,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        drafts?: ParsedTransactionDraft[];
        engine?: string;
        error?: string;
      };
      if (!res.ok || !data.drafts) {
        setAiError(data.error || "Belum ada transaksi yang terbaca.");
        setAiDrafts([]);
        return;
      }
      setAiDrafts(data.drafts);
      setAiEngine(data.engine || "local-parser");
    } catch {
      setAiError("Gagal menghubungi layanan parser. Coba ulangi.");
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
        "Browser ini belum mendukung dikte suara langsung. Silakan ketik transaksi di kolom di bawah atau gunakan Chrome/Edge.",
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
    rec.onend = () => {
      setListening(false);
    };
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
    reader.onerror = () => {
      setAiError("Gagal membaca file gambar struk.");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSaveAllDrafts = async () => {
    if (aiDrafts.length === 0) return;
    setSaving(true);
    try {
      await onSaveBatch(aiDrafts);
      onClose();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Gagal menyimpan daftar transaksi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sheet-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="animate-sheet-up flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-2xl sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
          <div className="flex items-center gap-3">
            <h2 id="sheet-title" className="text-base font-extrabold text-[var(--text-primary)]">
              {editingTx ? "Edit Transaksi" : "Tambah Transaksi"}
            </h2>
            {!editingTx && (
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
                  Catat AI
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup jendela transaksi"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-soft)] hover:text-[var(--text-primary)]"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto px-5 py-4">
          {mode === "manual" ? (
            <form onSubmit={handleSubmitManual} className="space-y-4">
              {/* Type toggle */}
              <div
                className="grid grid-cols-3 gap-1.5 rounded-2xl bg-[var(--bg-soft)] p-1"
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
                  const active = txType === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setTxType(key)}
                      className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-all ${
                        active
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

              {/* Big Nominal Input */}
              <div>
                <label
                  htmlFor="tx-amount"
                  className="mb-1 block text-xs font-bold text-[var(--text-muted)]"
                >
                  Nominal (Rupiah)
                </label>
                <div className="flex items-center rounded-2xl border-2 border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 py-3 focus-within:border-[var(--brand-primary)] focus-within:ring-2 focus-within:ring-[var(--brand-ring)]">
                  <span className="mr-2 text-lg font-extrabold text-[var(--text-muted)]">Rp</span>
                  <input
                    id="tx-amount"
                    type="text"
                    inputMode="numeric"
                    value={numericAmount > 0 ? numericAmount.toLocaleString("id-ID") : ""}
                    onChange={(e) => {
                      setAmountRaw(e.target.value.replace(/\D/g, ""));
                      setFormError(null);
                    }}
                    placeholder="0"
                    className="w-full bg-transparent text-2xl font-extrabold text-[var(--text-primary)] tabular-nums focus:outline-none"
                  />
                  {numericAmount > 0 && (
                    <button
                      type="button"
                      onClick={() => setAmountRaw("")}
                      className="ml-2 rounded-lg bg-[var(--bg-soft)] px-2 py-1 text-xs font-bold text-[var(--brand-primary)] dark:text-[#fda4af]"
                    >
                      Reset
                    </button>
                  )}
                </div>

                <div className="mt-2 grid grid-cols-5 gap-1.5">
                  {QUICK_AMOUNTS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => handleQuickAdd(item.value)}
                      className="min-h-[40px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-1 text-[11px] font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)] sm:text-xs"
                    >
                      {item.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAmountRaw("")}
                    className="min-h-[40px] rounded-xl border border-[var(--border-subtle)] bg-[var(--expense-bg)] px-1 text-[11px] font-bold text-[var(--expense-text)] hover:opacity-90 sm:text-xs"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Receipt shortcut inside manual mode (only for new expenses) */}
              {!editingTx && txType === "Keluar" && (
                <button
                  type="button"
                  onClick={() => setMode("ai")}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--brand-primary)]/50 bg-[var(--bg-soft)]/60 px-4 py-2.5 text-xs font-bold text-[var(--brand-primary)] hover:bg-[var(--bg-soft)] dark:text-[#fda4af]"
                >
                  <CameraIcon className="h-4 w-4" />
                  Gunakan AI Teks, Suara, atau Scan Struk
                </button>
              )}

              {/* Category Visual Icon Grid */}
              {txType !== "Transfer" && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--text-muted)]">Kategori</span>
                    <button
                      type="button"
                      onClick={() => {
                        setManagingCats((v) => !v);
                        setEditingCatId(null);
                        setEditCatName("");
                        setDeletingCatId(null);
                      }}
                      className="text-xs font-bold text-[var(--brand-primary)] underline-offset-2 hover:underline dark:text-[#fda4af]"
                    >
                      {managingCats ? "Selesai kelola" : "Kelola kategori"}
                    </button>
                  </div>

                  {managingCats && (
                    <div className="mb-3 space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3">
                      {deletingCat ? (
                        <div className="space-y-2.5">
                          <p className="text-xs font-extrabold text-[var(--expense-text)]">
                            Hapus kategori &ldquo;{deletingCat.name}&rdquo;?
                          </p>
                          {deletingTxCount > 0 ? (
                            <div>
                              <label
                                htmlFor="replacement-cat-select"
                                className="mb-1.5 block text-xs text-[var(--text-primary)]"
                              >
                                Kategori ini dipakai di <strong>{deletingTxCount} transaksi</strong>.
                                Pilih kategori pengganti untuk memindahkan transaksi tersebut:
                              </label>
                              <select
                                id="replacement-cat-select"
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
                              Kategori ini belum dipakai di transaksi mana pun.
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
                                  htmlFor="edit-cat-name"
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
                                  Tambah kategori baru
                                </button>
                              </div>
                              <div className="flex gap-2">
                                <input
                                  id="edit-cat-name"
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
                                htmlFor="new-cat-name"
                                className="mb-1.5 block text-xs font-bold text-[var(--text-primary)]"
                              >
                                Tambah Kategori {txType}
                              </label>
                              <div className="flex gap-2">
                                <input
                                  id="new-cat-name"
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
                                {editingCat ? "Pilih ikon baru:" : "Pilih ikon kategori:"}
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

                          {!editingCat && (
                            <p className="text-[11px] text-[var(--text-muted)]">
                              Tip: tahan &amp; geser ikon ⋮⋮ (atau seret kartu di PC) untuk atur urutan, ketuk kartu
                              untuk ubah nama/ikon, atau × untuk hapus.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  <div className={`grid grid-cols-3 gap-2 ${managingCats ? "select-none" : ""}`}>
                    {displayedCats.map((cat) => {
                      const selected = category === cat.name;
                      const isEditingTile = managingCats && editingCatId === cat.id;
                      const isDeletingTile = managingCats && deletingCatId === cat.id;
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
                              if (managingCats) {
                                setDeletingCatId(null);
                                if (editingCatId === cat.id) {
                                  setEditingCatId(null);
                                  setEditCatName("");
                                } else {
                                  setEditingCatId(cat.id);
                                  setEditCatName(cat.name);
                                }
                              } else {
                                setCategory(cat.name);
                              }
                            }}
                            className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl border p-2 text-center transition-all ${
                              managingCats ? "h-[80px] cursor-grab active:cursor-grabbing" : "min-h-[74px]"
                            } ${
                              isDraggingTile
                                ? "border-[var(--brand-primary)] bg-[var(--bg-soft)] shadow-md ring-2 ring-[var(--brand-primary)] text-[var(--brand-primary)] dark:text-[#fda4af]"
                                : isDeletingTile
                                  ? "border-[#BE123C] bg-[var(--expense-bg)] text-[var(--expense-text)]"
                                  : isEditingTile
                                    ? "border-dashed border-[var(--brand-primary)] bg-[var(--bg-soft)] ring-2 ring-[var(--brand-ring)] text-[var(--brand-primary)] dark:text-[#fda4af]"
                                    : selected
                                      ? "border-[var(--brand-primary)] bg-[var(--bg-soft)] text-[var(--brand-primary)] dark:text-[#fda4af]"
                                      : "border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--bg-soft)]/50"
                            }`}
                          >
                            <span
                              className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                                isDeletingTile
                                  ? "bg-[#BE123C] text-white"
                                  : selected || isEditingTile || isDraggingTile
                                    ? "bg-[var(--brand-primary)] text-white"
                                    : "bg-[var(--bg-soft)] text-[var(--brand-primary)] dark:text-[#fda4af]"
                              }`}
                            >
                              <CategoryIcon iconKey={cat.iconKey} className="h-4 w-4" />
                            </span>
                            <span className="line-clamp-2 text-[11px] font-bold leading-tight">
                              {cat.name}
                            </span>
                          </button>
                          {managingCats && filteredCats.length > 1 && (
                            <span
                              role="button"
                              tabIndex={-1}
                              aria-label={`Geser posisi kategori ${cat.name}`}
                              onPointerDown={(e) => startCategoryDrag(e, cat.id, true)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ touchAction: "none" }}
                              className="absolute left-1 top-1 flex h-7 w-6 cursor-grab items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-soft)] active:cursor-grabbing"
                            >
                              <GripIcon className="h-3.5 w-3.5" />
                            </span>
                          )}
                          {managingCats && filteredCats.length > 1 && (
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
                              className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#BE123C] text-xs font-bold text-white shadow-xs disabled:opacity-50"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Date Quick Pills */}
              <div>
                <label
                  htmlFor="tx-date"
                  className="mb-1.5 block text-xs font-bold text-[var(--text-muted)]"
                >
                  Tanggal
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setDate(todayIso)}
                    className={`min-h-[42px] rounded-xl border text-xs font-bold ${
                      date === todayIso
                        ? "border-[var(--brand-deep)] bg-[var(--brand-deep)] text-white"
                        : "border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)]"
                    }`}
                  >
                    Hari ini
                  </button>
                  <button
                    type="button"
                    onClick={() => setDate(yesterdayIso)}
                    className={`min-h-[42px] rounded-xl border text-xs font-bold ${
                      date === yesterdayIso
                        ? "border-[var(--brand-deep)] bg-[var(--brand-deep)] text-white"
                        : "border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)]"
                    }`}
                  >
                    Kemarin
                  </button>
                  <input
                    id="tx-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="min-h-[42px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 text-xs font-bold text-[var(--text-primary)]"
                  />
                </div>
              </div>

              {/* Account Selection */}
              <div className="grid gap-3 sm:grid-cols-1">
                <div>
                  <span className="mb-1.5 block text-xs font-bold text-[var(--text-muted)]">
                    {txType === "Transfer" ? "Dari Akun" : "Akun / Sumber Dana"}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {accounts.map((acc) => {
                      const active = accountId === acc.id;
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() => setAccountId(acc.id)}
                          className={`min-h-[40px] rounded-full border px-3.5 text-xs font-bold ${
                            active
                              ? "border-[var(--brand-primary)] bg-[var(--bg-soft)] text-[var(--brand-primary)] dark:text-[#fda4af]"
                              : "border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)]"
                          }`}
                        >
                          {acc.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {txType === "Transfer" && (
                  <div>
                    <span className="mb-1.5 block text-xs font-bold text-[var(--text-muted)]">
                      Ke Akun Tujuan
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {accounts.map((acc) => {
                        const active = toAccountId === acc.id;
                        return (
                          <button
                            key={acc.id}
                            type="button"
                            onClick={() => setToAccountId(acc.id)}
                            className={`min-h-[40px] rounded-full border px-3.5 text-xs font-bold ${
                              active
                                ? "border-[var(--brand-primary)] bg-[var(--bg-soft)] text-[var(--brand-primary)] dark:text-[#fda4af]"
                                : "border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)]"
                            }`}
                          >
                            {acc.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Note */}
              <div>
                <label
                  htmlFor="tx-note"
                  className="mb-1 block text-xs font-bold text-[var(--text-muted)]"
                >
                  Keterangan (opsional)
                </label>
                <input
                  id="tx-note"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Contoh: Makan siang warteg"
                  className="min-h-[44px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 text-sm text-[var(--text-primary)]"
                />
              </div>

              {goesNegative && effectiveBalance !== undefined && (
                <p
                  role="status"
                  className="rounded-xl bg-[#FEF3C7] px-3 py-2 text-xs font-semibold text-[#92400E] dark:bg-[#451A03] dark:text-[#FDE68A]"
                >
                  Saldo {sourceAccountName} tercatat {formatRupiah(effectiveBalance)}. Setelah transaksi ini jadi{" "}
                  {formatRupiah(effectiveBalance - numericAmount)}. Kalau saldo awal akun belum diisi, atur di Sheets &
                  Atur atau Koreksi Saldo.
                </p>
              )}

              {formError && (
                <p role="alert" className="rounded-xl bg-[var(--expense-bg)] px-3 py-2 text-xs font-bold text-[var(--expense-text)]">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="min-h-[48px] w-full rounded-2xl bg-[var(--brand-primary)] px-4 text-sm font-extrabold text-white shadow-sm hover:bg-[var(--brand-hover)] disabled:opacity-60"
              >
                {saving ? "Menyimpan..." : editingTx ? "Simpan Perubahan" : "Simpan Transaksi"}
              </button>
            </form>
          ) : (
            /* AI / Voice / Multi-Transaction Capture Mode */
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl bg-[var(--bg-soft)] p-3.5">
                <OctopusMascot mood="ai" size={62} className="shrink-0" />
                <div>
                  <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
                    Catat Sekaligus Pakai Suara atau Teks
                  </h3>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    Ucapkan atau tulis beberapa transaksi dalam satu kalimat. Guri akan memilah kategori dan akunnya untukmu periksa sebelum disimpan.
                  </p>
                </div>
              </div>

              {/* Receipt image upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleReceiptSelected}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex min-h-[44px] w-full items-center justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 py-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
              >
                <span className="flex items-center gap-2">
                  <CameraIcon className="h-4 w-4 text-[var(--brand-primary)] dark:text-[#fda4af]" />
                  Upload atau Foto Struk Belanja
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">Butuh Gemini API Key</span>
              </button>

              {/* Voice dictation button */}
              <button
                type="button"
                onClick={handleVoiceToggle}
                className={`flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl px-4 text-sm font-bold text-white transition-colors ${
                  listening
                    ? "bg-[#BE123C]"
                    : "bg-[var(--brand-primary)] hover:bg-[var(--brand-hover)]"
                }`}
              >
                <MicIcon className="h-5 w-5" />
                {listening ? "Mendengarkan... Ketuk untuk berhenti" : "Rekam Suara (Bahasa Indonesia)"}
              </button>

              {/* Examples */}
              <div>
                <span className="mb-1.5 block text-xs font-bold text-[var(--text-muted)]">
                  Contoh kalimat yang bisa dicoba:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {AI_EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setAiText(ex)}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-left text-[11px] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="ai-text-input"
                  className="mb-1 block text-xs font-bold text-[var(--text-muted)]"
                >
                  Teks Transaksi
                </label>
                <textarea
                  id="ai-text-input"
                  rows={3}
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  placeholder="Contoh: Ngopi 20rb cash, bensin 50rb ovo, transfer 100rb dari cash ke bca"
                  className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 text-sm text-[var(--text-primary)]"
                />
              </div>

              {aiError && (
                <p role="alert" className="rounded-xl bg-[var(--expense-bg)] px-3 py-2 text-xs font-bold text-[var(--expense-text)]">
                  {aiError}
                </p>
              )}

              <button
                type="button"
                disabled={aiBusy}
                onClick={() => runAiParse()}
                className="min-h-[46px] w-full rounded-2xl border-2 border-[var(--brand-primary)] bg-transparent text-sm font-extrabold text-[var(--brand-primary)] hover:bg-[var(--bg-soft)] disabled:opacity-60 dark:text-[#fda4af]"
              >
                {aiBusy ? "Memproses transaksi..." : "Analisa Kalimat Menjadi Transaksi"}
              </button>

              {/* Draft Preview Cards */}
              {aiDrafts.length > 0 && (
                <div className="space-y-2.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[var(--text-primary)]">
                      Hasil Deteksi ({aiDrafts.length} transaksi)
                    </span>
                    <span className="rounded-lg bg-[var(--bg-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-muted)]">
                      {aiEngine === "gemini" ? "Gemini AI" : "Parser Lokal"}
                    </span>
                  </div>

                  {aiDrafts.map((draft) => {
                    const accName =
                      accounts.find((a) => a.id === draft.accountId)?.name || draft.accountId;
                    return (
                      <div
                        key={draft.tempId}
                        className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2.5"
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
                            <span className="text-[11px] text-[var(--text-muted)]">
                              ({accName})
                            </span>
                          </div>
                          <p className="truncate text-[11px] text-[var(--text-muted)]">
                            {draft.note}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-xs font-extrabold text-[var(--text-primary)] tabular-nums">
                            {formatRupiah(draft.amount)}
                          </span>
                          <button
                            type="button"
                            aria-label={`Hapus draft ${draft.note}`}
                            onClick={() =>
                              setAiDrafts((prev) =>
                                prev.filter((item) => item.tempId !== draft.tempId),
                              )
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
                      className="rounded-xl bg-[#FEF3C7] px-3 py-2 text-xs font-semibold text-[#92400E] dark:bg-[#451A03] dark:text-[#FDE68A]"
                    >
                      Saldo setelah disimpan akan minus:{" "}
                      {aiNegativeAccounts.map((a) => `${a.name} (${formatRupiah(a.projected)})`).join(", ")}.
                      Pastikan saldo awal akun sudah diisi di Sheets & Atur.
                    </p>
                  )}

                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveAllDrafts}
                    className="min-h-[46px] w-full rounded-xl bg-[var(--brand-primary)] text-sm font-extrabold text-white hover:bg-[var(--brand-hover)] disabled:opacity-60"
                  >
                    {saving ? "Menyimpan..." : `Simpan Semua (${aiDrafts.length})`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
