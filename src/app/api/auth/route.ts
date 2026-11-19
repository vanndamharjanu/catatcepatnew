import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { toIsoDate } from "@/lib/finance";
import {
  createPkcePair,
  SB_PKCE_VERIFIER_COOKIE,
  secureCookieOptions,
} from "@/lib/security";
import {
  createInitialDb,
  readAsyncDb,
  recomputeGoalAmounts,
  toPublicState,
  writeAsyncDb,
} from "@/lib/store";
import {
  CC_ACCESS_COOKIE,
  CC_REFRESH_COOKIE,
  exchangeSupabasePkceCode,
  getSupabaseConfig,
  getSupabaseUser,
  isSupabaseConfigured,
  readSupabaseWorkspace,
  signInWithSupabasePassword,
  signUpWithSupabasePassword,
  writeSupabaseWorkspaceDelta,
} from "@/lib/supabase";
import type { Account, SavingGoal, Transaction, TransactionType } from "@/lib/types";

function sanitizeClientTransactions(rawList: unknown, accounts: Account[]): Transaction[] {
  if (!Array.isArray(rawList)) return [];
  const validAccIds = new Set(accounts.map((a) => a.id));
  const fallbackAccId = accounts[0]?.id || "acc-cash";
  const nowIso = new Date().toISOString();
  const out: Transaction[] = [];

  for (const item of rawList.slice(0, 500)) {
    if (!item || typeof item !== "object") continue;
    const tx = item as Partial<Transaction>;
    const amount = Math.round(Number(tx.amount) || 0);
    if (amount <= 0) continue;
    const type: TransactionType =
      tx.type === "Masuk" || tx.type === "Transfer" || tx.type === "Koreksi"
        ? tx.type
        : "Keluar";
    const date =
      typeof tx.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(tx.date)
        ? tx.date
        : toIsoDate();
    const accountId =
      typeof tx.accountId === "string" && validAccIds.has(tx.accountId)
        ? tx.accountId
        : fallbackAccId;
    const toAccountId =
      type === "Transfer" &&
      typeof tx.toAccountId === "string" &&
      validAccIds.has(tx.toAccountId) &&
      tx.toAccountId !== accountId
        ? tx.toAccountId
        : undefined;
    if (type === "Transfer" && !toAccountId) continue;

    out.push({
      id: typeof tx.id === "string" && tx.id.trim() ? tx.id.trim().slice(0, 64) : randomUUID(),
      date,
      type,
      category:
        typeof tx.category === "string" && tx.category.trim()
          ? tx.category.trim().slice(0, 50)
          : "Lain-lain",
      accountId,
      toAccountId,
      amount,
      note: typeof tx.note === "string" ? tx.note.trim().slice(0, 200) : "",
      goalId: typeof tx.goalId === "string" ? tx.goalId.slice(0, 64) : undefined,
      source: "manual",
      sheetSyncStatus: "local_only",
      createdAt: typeof tx.createdAt === "string" ? tx.createdAt : nowIso,
      updatedAt: typeof tx.updatedAt === "string" ? tx.updatedAt : nowIso,
    });
  }
  return out;
}

function sanitizeClientGoals(rawList: unknown): SavingGoal[] {
  if (!Array.isArray(rawList)) return [];
  const nowIso = new Date().toISOString();
  const out: SavingGoal[] = [];
  for (const item of rawList.slice(0, 50)) {
    if (!item || typeof item !== "object") continue;
    const g = item as Partial<SavingGoal>;
    const name = typeof g.name === "string" ? g.name.trim().slice(0, 60) : "";
    const targetAmount = Math.round(Number(g.targetAmount) || 0);
    if (!name || targetAmount <= 0) continue;
    out.push({
      id: typeof g.id === "string" && g.id.trim() ? g.id.trim().slice(0, 64) : randomUUID(),
      name,
      targetAmount,
      currentAmount: Math.max(0, Math.round(Number(g.currentAmount) || 0)),
      deadline:
        typeof g.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(g.deadline)
          ? g.deadline
          : undefined,
      createdAt: typeof g.createdAt === "string" ? g.createdAt : nowIso,
    });
  }
  return out;
}

export async function GET(request: Request) {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    return NextResponse.json(
      {
        error: "Layanan akun online sedang tidak tersedia di server ini.",
      },
      { status: 400 },
    );
  }
  const { searchParams } = new URL(request.url);
  const requested = searchParams.get("provider") || "google";
  if (requested !== "google") {
    return NextResponse.json({ error: "Provider login tidak didukung." }, { status: 400 });
  }
  const { verifier, challenge } = createPkcePair();
  const cookieStore = await cookies();
  cookieStore.set(SB_PKCE_VERIFIER_COOKIE, verifier, secureCookieOptions(60 * 10));

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const authUrl = `${cfg.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(appUrl)}&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=s256`;
  return NextResponse.json({ url: authUrl });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?:
        | "login"
        | "register"
        | "logout"
        | "migrate_local"
        | "session_from_tokens"
        | "exchange_pkce_code";
      email?: string;
      password?: string;
      migrateLocal?: boolean;
      localTransactions?: unknown[];
      localGoals?: unknown[];
      accessToken?: string;
      refreshToken?: string;
      code?: string;
    };

    const cookieStore = await cookies();

    if (body.action === "logout") {
      cookieStore.delete(CC_ACCESS_COOKIE);
      cookieStore.delete(CC_REFRESH_COOKIE);
      cookieStore.delete(SB_PKCE_VERIFIER_COOKIE);
      return NextResponse.json({ state: toPublicState(createInitialDb()) });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        {
          error: "Layanan akun online sedang tidak tersedia di server ini.",
        },
        { status: 400 },
      );
    }

    if (body.action === "exchange_pkce_code") {
      const code = (body.code || "").trim();
      const verifier = cookieStore.get(SB_PKCE_VERIFIER_COOKIE)?.value || "";
      cookieStore.delete(SB_PKCE_VERIFIER_COOKIE);
      if (!code || !verifier) {
        return NextResponse.json(
          { error: "Kode atau sesi verifikasi PKCE login Google tidak ditemukan. Silakan masuk ulang." },
          { status: 400 },
        );
      }
      const exchanged = await exchangeSupabasePkceCode(code, verifier);
      if (exchanged.error || !exchanged.session) {
        return NextResponse.json(
          { error: exchanged.error || "Gagal menukar kode login Google." },
          { status: 401 },
        );
      }
      cookieStore.set(
        CC_ACCESS_COOKIE,
        exchanged.session.accessToken,
        secureCookieOptions(60 * 60 * 24 * 7),
      );
      if (exchanged.session.refreshToken) {
        cookieStore.set(
          CC_REFRESH_COOKIE,
          exchanged.session.refreshToken,
          secureCookieOptions(60 * 60 * 24 * 30),
        );
      }
      const { db } = await readSupabaseWorkspace(exchanged.session, createInitialDb());
      recomputeGoalAmounts(db);
      return NextResponse.json({ state: toPublicState(db) });
    }

    if (body.action === "session_from_tokens") {
      const accessToken = (body.accessToken || "").trim();
      const refreshToken = (body.refreshToken || "").trim();
      if (!accessToken) {
        return NextResponse.json({ error: "Sesi login Google tidak ditemukan." }, { status: 400 });
      }
      const user = await getSupabaseUser(accessToken);
      if (!user) {
        return NextResponse.json(
          { error: "Sesi login Google tidak valid atau kedaluwarsa. Silakan coba masuk lagi." },
          { status: 401 },
        );
      }
      cookieStore.set(CC_ACCESS_COOKIE, accessToken, secureCookieOptions(60 * 60 * 24 * 7));
      if (refreshToken) {
        cookieStore.set(CC_REFRESH_COOKIE, refreshToken, secureCookieOptions(60 * 60 * 24 * 30));
      }
      const session = { accessToken, refreshToken, user };
      const { db } = await readSupabaseWorkspace(session, createInitialDb());
      recomputeGoalAmounts(db);
      return NextResponse.json({ state: toPublicState(db) });
    }

    if (body.action === "migrate_local") {
      const cloudDb = await readAsyncDb();
      if (!cloudDb.auth?.authenticated) {
        return NextResponse.json({ error: "Silakan masuk ke akun Anda terlebih dahulu." }, { status: 401 });
      }
      const incomingTxs = sanitizeClientTransactions(body.localTransactions, cloudDb.accounts);
      const incomingGoals = sanitizeClientGoals(body.localGoals);
      const existingTxIds = new Set(cloudDb.transactions.map((t) => t.id));
      const newTxs = incomingTxs.filter((t) => !existingTxIds.has(t.id));
      const existingGoalIds = new Set(cloudDb.goals.map((g) => g.id));
      const newGoals = incomingGoals.filter((g) => !existingGoalIds.has(g.id));

      cloudDb.goals = [...cloudDb.goals, ...newGoals];
      cloudDb.transactions = [...newTxs, ...cloudDb.transactions];
      await writeAsyncDb(cloudDb);
      return NextResponse.json({
        migratedCount: newTxs.length,
        state: toPublicState(cloudDb),
      });
    }

    const email = (body.email || "").trim();
    const password = body.password || "";
    if (!email || !password) {
      return NextResponse.json({ error: "Email dan password wajib diisi." }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password minimal 6 karakter." }, { status: 400 });
    }

    if (body.action === "register") {
      const result = await signUpWithSupabasePassword(email, password);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      if (result.needsEmailConfirmation || !result.session) {
        return NextResponse.json({
          needsEmailConfirmation: true,
          message:
            "Pendaftaran berhasil! Silakan buka kotak masuk email Anda dan klik tautan verifikasi untuk masuk.",
        });
      }

      cookieStore.set(CC_ACCESS_COOKIE, result.session.accessToken, secureCookieOptions(60 * 60 * 24 * 7));
      cookieStore.set(CC_REFRESH_COOKIE, result.session.refreshToken, secureCookieOptions(60 * 60 * 24 * 30));

      const { workspaceId, db } = await readSupabaseWorkspace(result.session, createInitialDb());
      if (body.migrateLocal) {
        const incomingTxs = sanitizeClientTransactions(body.localTransactions, db.accounts);
        const incomingGoals = sanitizeClientGoals(body.localGoals);
        if (incomingTxs.length > 0 || incomingGoals.length > 0) {
          const baseline = structuredClone(db);
          db.goals = [...db.goals, ...incomingGoals];
          db.transactions = [...incomingTxs, ...db.transactions];
          recomputeGoalAmounts(db);
          await writeSupabaseWorkspaceDelta(result.session, workspaceId, baseline, db);
        }
      }
      return NextResponse.json({ state: toPublicState(db) });
    }

    // Default: login
    const result = await signInWithSupabasePassword(email, password);
    if (result.error || !result.session) {
      return NextResponse.json({ error: result.error || "Gagal masuk." }, { status: 401 });
    }

    cookieStore.set(CC_ACCESS_COOKIE, result.session.accessToken, secureCookieOptions(60 * 60 * 24 * 7));
    cookieStore.set(CC_REFRESH_COOKIE, result.session.refreshToken, secureCookieOptions(60 * 60 * 24 * 30));

    const { workspaceId, db } = await readSupabaseWorkspace(result.session, createInitialDb());
    if (body.migrateLocal) {
      const incomingTxs = sanitizeClientTransactions(body.localTransactions, db.accounts);
      const existingTxIds = new Set(db.transactions.map((t) => t.id));
      const newTxs = incomingTxs.filter((t) => !existingTxIds.has(t.id));
      if (newTxs.length > 0) {
        const baseline = structuredClone(db);
        db.transactions = [...newTxs, ...db.transactions];
        recomputeGoalAmounts(db);
        await writeSupabaseWorkspaceDelta(result.session, workspaceId, baseline, db);
      }
    }
    recomputeGoalAmounts(db);
    return NextResponse.json({ state: toPublicState(db) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal memproses akun. Silakan coba beberapa saat lagi." },
      { status: 500 },
    );
  }
}
