import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  createInitialDb,
  readAsyncDb,
  readDb,
  recomputeGoalAmounts,
  toPublicState,
  writeAsyncDb,
} from "@/lib/store";
import {
  CC_ACCESS_COOKIE,
  CC_REFRESH_COOKIE,
  getSupabaseConfig,
  getSupabaseUser,
  isSupabaseConfigured,
  readSupabaseWorkspace,
  signInWithSupabasePassword,
  signUpWithSupabasePassword,
  writeSupabaseWorkspaceDelta,
} from "@/lib/supabase";

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
  const provider = searchParams.get("provider") || "google";
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const authUrl = `${cfg.url}/auth/v1/authorize?provider=${encodeURIComponent(provider)}&redirect_to=${encodeURIComponent(appUrl)}`;
  return NextResponse.json({ url: authUrl });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: "login" | "register" | "logout" | "migrate_local" | "session_from_tokens";
      email?: string;
      password?: string;
      migrateLocal?: boolean;
      accessToken?: string;
      refreshToken?: string;
    };

    const cookieStore = await cookies();

    if (body.action === "logout") {
      cookieStore.delete(CC_ACCESS_COOKIE);
      cookieStore.delete(CC_REFRESH_COOKIE);
      return NextResponse.json({ state: toPublicState(readDb()) });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        {
          error: "Layanan akun online sedang tidak tersedia di server ini.",
        },
        { status: 400 },
      );
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
      cookieStore.set(CC_ACCESS_COOKIE, accessToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
      if (refreshToken) {
        cookieStore.set(CC_REFRESH_COOKIE, refreshToken, {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 30,
        });
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
      const localDb = readDb();
      const existingTxIds = new Set(cloudDb.transactions.map((t) => t.id));
      const newTxs = localDb.transactions.filter((t) => !existingTxIds.has(t.id));
      const existingGoalIds = new Set(cloudDb.goals.map((g) => g.id));
      const newGoals = localDb.goals.filter((g) => !existingGoalIds.has(g.id));

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

      cookieStore.set(CC_ACCESS_COOKIE, result.session.accessToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
      cookieStore.set(CC_REFRESH_COOKIE, result.session.refreshToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });

      const seed = body.migrateLocal ? readDb() : createInitialDb();
      const { workspaceId, db } = await readSupabaseWorkspace(result.session, seed);
      if (body.migrateLocal && (seed.transactions.length > 0 || seed.goals.length > 0)) {
        const baseline = structuredClone(db);
        db.goals = seed.goals;
        db.transactions = seed.transactions;
        recomputeGoalAmounts(db);
        await writeSupabaseWorkspaceDelta(result.session, workspaceId, baseline, db);
      }
      return NextResponse.json({ state: toPublicState(db) });
    }

    // Default: login
    const result = await signInWithSupabasePassword(email, password);
    if (result.error || !result.session) {
      return NextResponse.json({ error: result.error || "Gagal masuk." }, { status: 401 });
    }

    cookieStore.set(CC_ACCESS_COOKIE, result.session.accessToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    cookieStore.set(CC_REFRESH_COOKIE, result.session.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    const { workspaceId, db } = await readSupabaseWorkspace(result.session, createInitialDb());
    if (body.migrateLocal) {
      const localDb = readDb();
      const existingTxIds = new Set(db.transactions.map((t) => t.id));
      const newTxs = localDb.transactions.filter((t) => !existingTxIds.has(t.id));
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
