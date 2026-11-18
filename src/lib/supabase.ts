import type {
  Account,
  AppDatabase,
  CategoryItem,
  SavingGoal,
  SheetConnection,
  Transaction,
  WorkspaceSettings,
} from "./types.ts";

export const CC_ACCESS_COOKIE = "cc_sb_access";
export const CC_REFRESH_COOKIE = "cc_sb_refresh";

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

export interface SupabaseAuthUser {
  id: string;
  email: string;
}

export interface SupabaseSession {
  accessToken: string;
  refreshToken: string;
  user: SupabaseAuthUser;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const anonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
  )?.trim();
  if (!url || !anonKey) return null;
  return {
    url,
    anonKey,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined,
  };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

function parseSupabaseAuthError(rawText: string, fallback: string): string {
  try {
    const parsed = JSON.parse(rawText) as {
      msg?: string;
      message?: string;
      error_description?: string;
      error?: string;
    };
    const msg = parsed.error_description || parsed.msg || parsed.message || parsed.error || "";
    if (/invalid login credentials/i.test(msg)) {
      return "Email atau password salah.";
    }
    if (/email not confirmed/i.test(msg)) {
      return "Email belum diverifikasi. Cek kotak masuk email Anda atau nonaktifkan 'Confirm email' di Supabase Auth.";
    }
    if (/user already registered/i.test(msg)) {
      return "Email ini sudah terdaftar. Silakan gunakan menu Masuk.";
    }
    if (/password should be at least/i.test(msg)) {
      return "Password minimal 6 karakter.";
    }
    return msg || fallback;
  } catch {
    return fallback;
  }
}

export async function signInWithSupabasePassword(
  email: string,
  password: string,
): Promise<{ session?: SupabaseSession; error?: string }> {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    return { error: "NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY belum diisi di .env.local." };
  }

  let res: Response;
  try {
    res = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: cfg.anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: email.trim(), password }),
      cache: "no-store",
    });
  } catch {
    return { error: "Gagal menghubungi server Supabase Auth." };
  }

  const rawText = await res.text();
  if (!res.ok) {
    return { error: parseSupabaseAuthError(rawText, "Gagal masuk ke akun Supabase.") };
  }

  const data = JSON.parse(rawText) as {
    access_token?: string;
    refresh_token?: string;
    user?: { id?: string; email?: string };
  };
  if (!data.access_token || !data.user?.id) {
    return { error: "Respons sesi Supabase tidak lengkap." };
  }

  return {
    session: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || "",
      user: {
        id: data.user.id,
        email: data.user.email || email.trim(),
      },
    },
  };
}

export async function signUpWithSupabasePassword(
  email: string,
  password: string,
): Promise<{
  session?: SupabaseSession;
  needsEmailConfirmation?: boolean;
  error?: string;
}> {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    return { error: "NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY belum diisi di .env.local." };
  }

  let res: Response;
  try {
    res = await fetch(`${cfg.url}/auth/v1/signup`, {
      method: "POST",
      headers: {
        apikey: cfg.anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: email.trim(), password }),
      cache: "no-store",
    });
  } catch {
    return { error: "Gagal menghubungi server Supabase Auth." };
  }

  const rawText = await res.text();
  if (!res.ok) {
    return { error: parseSupabaseAuthError(rawText, "Gagal mendaftarkan akun baru.") };
  }

  const data = JSON.parse(rawText) as {
    access_token?: string;
    refresh_token?: string;
    id?: string;
    email?: string;
    user?: { id?: string; email?: string };
  };

  const userId = data.user?.id || data.id;
  const userEmail = data.user?.email || data.email || email.trim();

  if (data.access_token && userId) {
    return {
      session: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || "",
        user: { id: userId, email: userEmail },
      },
    };
  }

  return {
    needsEmailConfirmation: true,
  };
}

export async function refreshSupabaseToken(
  refreshToken: string,
): Promise<SupabaseSession | null> {
  const cfg = getSupabaseConfig();
  if (!cfg || !refreshToken) return null;

  try {
    const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: cfg.anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      user?: { id?: string; email?: string };
    };
    if (!data.access_token || !data.user?.id) return null;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      user: {
        id: data.user.id,
        email: data.user.email || "",
      },
    };
  } catch {
    return null;
  }
}

export async function getSupabaseUser(accessToken: string): Promise<SupabaseAuthUser | null> {
  const cfg = getSupabaseConfig();
  if (!cfg || !accessToken) return null;

  try {
    const res = await fetch(`${cfg.url}/auth/v1/user`, {
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string; email?: string };
    if (!data.id) return null;
    return { id: data.id, email: data.email || "" };
  } catch {
    return null;
  }
}

export async function getActiveSessionFromCookies(): Promise<SupabaseSession | null> {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;

  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    const accessToken = store.get(CC_ACCESS_COOKIE)?.value;
    const refreshToken = store.get(CC_REFRESH_COOKIE)?.value || "";

    if (accessToken) {
      const user = await getSupabaseUser(accessToken);
      if (user) {
        return { accessToken, refreshToken, user };
      }
    }

    if (refreshToken) {
      const refreshed = await refreshSupabaseToken(refreshToken);
      if (refreshed) {
        try {
          store.set(CC_ACCESS_COOKIE, refreshed.accessToken, {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24 * 7,
          });
          store.set(CC_REFRESH_COOKIE, refreshed.refreshToken, {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24 * 30,
          });
        } catch {
          // Server Component render context cannot mutate cookies; session is still valid for this request.
        }
        return refreshed;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export interface WorkspaceDelta {
  settingsChanged: boolean;
  upsertedAccounts: Array<Account & { sortOrder: number }>;
  deletedAccountIds: string[];
  upsertedCategories: Array<CategoryItem & { sortOrder: number }>;
  deletedCategoryIds: string[];
  upsertedGoals: SavingGoal[];
  deletedGoalIds: string[];
  clearAllGoals: boolean;
  upsertedTransactions: Transaction[];
  deletedTransactionIds: string[];
  clearAllTransactions: boolean;
  sheetConnectionChanged: boolean;
}

/**
 * Compute minimal row-level diff between initial and mutated AppDatabase so
 * Supabase updates only transmit modified rows (protecting the 5 GB Free Tier egress).
 */
export function computeDbDiff(before: AppDatabase, after: AppDatabase): WorkspaceDelta {
  const settingsChanged =
    before.settings.name !== after.settings.name ||
    before.settings.monthlyBudget !== after.settings.monthlyBudget ||
    before.settings.paydayDay !== after.settings.paydayDay ||
    before.settings.plan !== after.settings.plan ||
    before.settings.categoryPreset !== after.settings.categoryPreset;

  const beforeAccMap = new Map(
    before.accounts.map((a, idx) => [a.id, { ...a, sortOrder: idx }]),
  );
  const afterAccIds = new Set(after.accounts.map((a) => a.id));
  const deletedAccountIds = before.accounts
    .filter((a) => !afterAccIds.has(a.id))
    .map((a) => a.id);
  const upsertedAccounts = after.accounts
    .map((a, idx) => ({ ...a, sortOrder: idx }))
    .filter((a) => {
      const prev = beforeAccMap.get(a.id);
      return (
        !prev ||
        prev.name !== a.name ||
        prev.kind !== a.kind ||
        prev.initialBalance !== a.initialBalance ||
        prev.sortOrder !== a.sortOrder
      );
    });

  const beforeCatMap = new Map(
    before.categories.map((c, idx) => [c.id, { ...c, sortOrder: idx }]),
  );
  const afterCatIds = new Set(after.categories.map((c) => c.id));
  const deletedCategoryIds = before.categories
    .filter((c) => !afterCatIds.has(c.id))
    .map((c) => c.id);
  const upsertedCategories = after.categories
    .map((c, idx) => ({ ...c, sortOrder: idx }))
    .filter((c) => {
      const prev = beforeCatMap.get(c.id);
      return (
        !prev ||
        prev.name !== c.name ||
        prev.type !== c.type ||
        prev.iconKey !== c.iconKey ||
        prev.sortOrder !== c.sortOrder
      );
    });

  const beforeGoalMap = new Map(before.goals.map((g) => [g.id, g]));
  const afterGoalIds = new Set(after.goals.map((g) => g.id));
  const clearAllGoals = before.goals.length > 0 && after.goals.length === 0;
  const deletedGoalIds = clearAllGoals
    ? []
    : before.goals.filter((g) => !afterGoalIds.has(g.id)).map((g) => g.id);
  const upsertedGoals = after.goals.filter((g) => {
    const prev = beforeGoalMap.get(g.id);
    return (
      !prev ||
      prev.name !== g.name ||
      prev.targetAmount !== g.targetAmount ||
      prev.currentAmount !== g.currentAmount ||
      prev.deadline !== g.deadline
    );
  });

  const beforeTxMap = new Map(before.transactions.map((t) => [t.id, t]));
  const afterTxIds = new Set(after.transactions.map((t) => t.id));
  const clearAllTransactions =
    before.transactions.length > 0 && after.transactions.length === 0;
  const deletedTransactionIds = clearAllTransactions
    ? []
    : before.transactions.filter((t) => !afterTxIds.has(t.id)).map((t) => t.id);
  const upsertedTransactions = after.transactions.filter((t) => {
    const prev = beforeTxMap.get(t.id);
    return (
      !prev ||
      prev.updatedAt !== t.updatedAt ||
      prev.date !== t.date ||
      prev.type !== t.type ||
      prev.category !== t.category ||
      prev.accountId !== t.accountId ||
      prev.toAccountId !== t.toAccountId ||
      prev.amount !== t.amount ||
      prev.note !== t.note ||
      prev.goalId !== t.goalId ||
      prev.sheetSyncStatus !== t.sheetSyncStatus
    );
  });

  const bConn = before.sheetConnection;
  const aConn = after.sheetConnection;
  const sheetConnectionChanged =
    bConn.connected !== aConn.connected ||
    bConn.googleEmail !== aConn.googleEmail ||
    bConn.spreadsheetId !== aConn.spreadsheetId ||
    bConn.spreadsheetUrl !== aConn.spreadsheetUrl ||
    bConn.sheetTabName !== aConn.sheetTabName ||
    bConn.sheetTabId !== aConn.sheetTabId ||
    bConn.encryptedRefreshToken !== aConn.encryptedRefreshToken ||
    bConn.lastSyncedAt !== aConn.lastSyncedAt ||
    bConn.lastError !== aConn.lastError ||
    JSON.stringify(bConn.pendingDeletes ?? []) !== JSON.stringify(aConn.pendingDeletes ?? []);

  return {
    settingsChanged,
    upsertedAccounts,
    deletedAccountIds,
    upsertedCategories,
    deletedCategoryIds,
    upsertedGoals,
    deletedGoalIds,
    clearAllGoals,
    upsertedTransactions,
    deletedTransactionIds,
    clearAllTransactions,
    sheetConnectionChanged,
  };
}

async function sbRestFetch(
  cfg: SupabaseConfig,
  accessToken: string,
  pathAndQuery: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${cfg.url}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Supabase REST error (${res.status} on ${pathAndQuery}): ${detail.slice(0, 240)}`,
    );
  }
  return res;
}

function encodeInFilter(ids: string[]): string {
  return `(${ids.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(",")})`;
}

export async function readSupabaseWorkspace(
  session: SupabaseSession,
  defaultSeed: AppDatabase,
): Promise<{ workspaceId: string; db: AppDatabase }> {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    throw new Error("Supabase belum dikonfigurasi.");
  }

  const wsRes = await sbRestFetch(
    cfg,
    session.accessToken,
    `workspaces?owner_id=eq.${encodeURIComponent(session.user.id)}&select=id,name,monthly_budget,payday_day,plan,category_preset&limit=1`,
  );
  const wsRows = (await wsRes.json()) as Array<{
    id: string;
    name: string;
    monthly_budget: number;
    payday_day: number;
    plan: "free" | "pro";
    category_preset?: WorkspaceSettings["categoryPreset"];
  }>;

  const hasGoogleConfig = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );

  // First-time user login: create workspace and seed initial accounts + categories
  if (wsRows.length === 0) {
    const createRes = await sbRestFetch(cfg, session.accessToken, "workspaces?select=id", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        owner_id: session.user.id,
        name: defaultSeed.settings.name,
        monthly_budget: defaultSeed.settings.monthlyBudget,
        payday_day: defaultSeed.settings.paydayDay,
        plan: defaultSeed.settings.plan,
        category_preset: defaultSeed.settings.categoryPreset,
      }),
    });
    const created = (await createRes.json()) as Array<{ id: string }>;
    const workspaceId = created[0].id;

    if (defaultSeed.accounts.length > 0) {
      await sbRestFetch(
        cfg,
        session.accessToken,
        "accounts?on_conflict=workspace_id,id",
        {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(
            defaultSeed.accounts.map((a, idx) => ({
              workspace_id: workspaceId,
              id: a.id,
              name: a.name,
              kind: a.kind,
              initial_balance: a.initialBalance,
              sort_order: idx,
            })),
          ),
        },
      );
    }

    if (defaultSeed.categories.length > 0) {
      await sbRestFetch(
        cfg,
        session.accessToken,
        "categories?on_conflict=workspace_id,id",
        {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(
            defaultSeed.categories.map((c, idx) => ({
              workspace_id: workspaceId,
              id: c.id,
              name: c.name,
              type: c.type,
              icon_key: c.iconKey,
              sort_order: idx,
            })),
          ),
        },
      );
    }

    const freshDb: AppDatabase = {
      ...defaultSeed,
      sheetConnection: {
        configured: hasGoogleConfig,
        connected: false,
        sheetTabName: "Transaksi",
      },
      auth: {
        configured: true,
        authenticated: true,
        mode: "supabase",
        email: session.user.email,
        userId: session.user.id,
      },
    };
    return { workspaceId, db: freshDb };
  }

  const ws = wsRows[0];
  const workspaceId = ws.id;
  const wFilter = `workspace_id=eq.${encodeURIComponent(workspaceId)}`;

  const [accRes, catRes, goalRes, txRes, sheetRes] = await Promise.all([
    sbRestFetch(
      cfg,
      session.accessToken,
      `accounts?${wFilter}&select=id,name,kind,initial_balance,sort_order&order=sort_order.asc`,
    ),
    sbRestFetch(
      cfg,
      session.accessToken,
      `categories?${wFilter}&select=id,name,type,icon_key,sort_order&order=sort_order.asc`,
    ),
    sbRestFetch(
      cfg,
      session.accessToken,
      `saving_goals?${wFilter}&select=id,name,target_amount,current_amount,deadline,created_at&order=created_at.asc`,
    ),
    sbRestFetch(
      cfg,
      session.accessToken,
      `transactions?${wFilter}&select=id,date,type,category,account_id,to_account_id,amount,note,goal_id,source,sheet_sync_status,created_at,updated_at&order=date.desc,created_at.desc`,
    ),
    sbRestFetch(
      cfg,
      session.accessToken,
      `google_sheet_connections?${wFilter}&select=connected,google_email,spreadsheet_id,spreadsheet_url,sheet_tab_name,sheet_tab_id,encrypted_refresh_token,last_synced_at,last_error,pending_deletes&limit=1`,
    ),
  ]);

  const accRows = (await accRes.json()) as Array<{
    id: string;
    name: string;
    kind: Account["kind"];
    initial_balance: number;
  }>;
  const catRows = (await catRes.json()) as Array<{
    id: string;
    name: string;
    type: CategoryItem["type"];
    icon_key: string;
  }>;
  const goalRows = (await goalRes.json()) as Array<{
    id: string;
    name: string;
    target_amount: number;
    current_amount: number;
    deadline?: string | null;
    created_at: string;
  }>;
  const txRows = (await txRes.json()) as Array<{
    id: string;
    date: string;
    type: Transaction["type"];
    category: string;
    account_id: string;
    to_account_id?: string | null;
    amount: number;
    note: string;
    goal_id?: string | null;
    source: Transaction["source"];
    sheet_sync_status: Transaction["sheetSyncStatus"];
    created_at: string;
    updated_at: string;
  }>;
  const sheetRows = (await sheetRes.json()) as Array<{
    connected: boolean;
    google_email?: string | null;
    spreadsheet_id?: string | null;
    spreadsheet_url?: string | null;
    sheet_tab_name?: string | null;
    sheet_tab_id?: number | null;
    encrypted_refresh_token?: string | null;
    last_synced_at?: string | null;
    last_error?: string | null;
    pending_deletes?: string[] | null;
  }>;

  const sheetRow = sheetRows[0];
  const sheetConnection: SheetConnection = {
    configured: hasGoogleConfig,
    connected: Boolean(sheetRow?.connected && sheetRow?.spreadsheet_id),
    googleEmail: sheetRow?.google_email || undefined,
    spreadsheetId: sheetRow?.spreadsheet_id || undefined,
    spreadsheetUrl: sheetRow?.spreadsheet_url || undefined,
    sheetTabName: sheetRow?.sheet_tab_name || "Transaksi",
    sheetTabId: sheetRow?.sheet_tab_id ?? undefined,
    encryptedRefreshToken: sheetRow?.encrypted_refresh_token || undefined,
    lastSyncedAt: sheetRow?.last_synced_at || undefined,
    lastError: sheetRow?.last_error || undefined,
    pendingDeletes: sheetRow?.pending_deletes ?? [],
  };

  const db: AppDatabase = {
    settings: {
      name: ws.name || "Keuangan Pribadi",
      monthlyBudget: Number(ws.monthly_budget ?? 3_000_000),
      paydayDay: Number(ws.payday_day ?? 25),
      plan: ws.plan || "free",
      categoryPreset: ws.category_preset || "asn_karyawan",
    },
    accounts:
      accRows.length > 0
        ? accRows.map((a) => ({
            id: a.id,
            name: a.name,
            kind: a.kind,
            initialBalance: Number(a.initial_balance ?? 0),
          }))
        : defaultSeed.accounts,
    categories:
      catRows.length > 0
        ? catRows.map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            iconKey: c.icon_key || "tag",
          }))
        : defaultSeed.categories,
    goals: goalRows.map((g) => ({
      id: g.id,
      name: g.name,
      targetAmount: Number(g.target_amount),
      currentAmount: Number(g.current_amount ?? 0),
      deadline: g.deadline || undefined,
      createdAt: g.created_at,
    })),
    transactions: txRows.map((t) => ({
      id: t.id,
      date: t.date,
      type: t.type,
      category: t.category,
      accountId: t.account_id,
      toAccountId: t.to_account_id || undefined,
      amount: Number(t.amount),
      note: t.note || "",
      goalId: t.goal_id || undefined,
      source: t.source || "manual",
      sheetSyncStatus: t.sheet_sync_status || "local_only",
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    })),
    sheetConnection,
    auth: {
      configured: true,
      authenticated: true,
      mode: "supabase",
      email: session.user.email,
      userId: session.user.id,
    },
  };

  return { workspaceId, db };
}

export async function writeSupabaseWorkspaceDelta(
  session: SupabaseSession,
  workspaceId: string,
  before: AppDatabase,
  after: AppDatabase,
): Promise<void> {
  const cfg = getSupabaseConfig();
  if (!cfg) return;

  const delta = computeDbDiff(before, after);
  const wFilter = `workspace_id=eq.${encodeURIComponent(workspaceId)}`;

  if (delta.settingsChanged) {
    await sbRestFetch(
      cfg,
      session.accessToken,
      `workspaces?id=eq.${encodeURIComponent(workspaceId)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          name: after.settings.name,
          monthly_budget: after.settings.monthlyBudget,
          payday_day: after.settings.paydayDay,
          plan: after.settings.plan,
          category_preset: after.settings.categoryPreset,
          updated_at: new Date().toISOString(),
        }),
      },
    );
  }

  if (delta.deletedAccountIds.length > 0) {
    await sbRestFetch(
      cfg,
      session.accessToken,
      `accounts?${wFilter}&id=in.${encodeURIComponent(encodeInFilter(delta.deletedAccountIds))}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
  }
  if (delta.upsertedAccounts.length > 0) {
    await sbRestFetch(
      cfg,
      session.accessToken,
      "accounts?on_conflict=workspace_id,id",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(
          delta.upsertedAccounts.map((a) => ({
            workspace_id: workspaceId,
            id: a.id,
            name: a.name,
            kind: a.kind,
            initial_balance: a.initialBalance,
            sort_order: a.sortOrder,
          })),
        ),
      },
    );
  }

  if (delta.deletedCategoryIds.length > 0) {
    await sbRestFetch(
      cfg,
      session.accessToken,
      `categories?${wFilter}&id=in.${encodeURIComponent(encodeInFilter(delta.deletedCategoryIds))}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
  }
  if (delta.upsertedCategories.length > 0) {
    await sbRestFetch(
      cfg,
      session.accessToken,
      "categories?on_conflict=workspace_id,id",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(
          delta.upsertedCategories.map((c) => ({
            workspace_id: workspaceId,
            id: c.id,
            name: c.name,
            type: c.type,
            icon_key: c.iconKey,
            sort_order: c.sortOrder,
          })),
        ),
      },
    );
  }

  if (delta.clearAllGoals) {
    await sbRestFetch(cfg, session.accessToken, `saving_goals?${wFilter}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  } else if (delta.deletedGoalIds.length > 0) {
    await sbRestFetch(
      cfg,
      session.accessToken,
      `saving_goals?${wFilter}&id=in.${encodeURIComponent(encodeInFilter(delta.deletedGoalIds))}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
  }
  if (delta.upsertedGoals.length > 0) {
    await sbRestFetch(
      cfg,
      session.accessToken,
      "saving_goals?on_conflict=workspace_id,id",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(
          delta.upsertedGoals.map((g) => ({
            workspace_id: workspaceId,
            id: g.id,
            name: g.name,
            target_amount: g.targetAmount,
            current_amount: g.currentAmount,
            deadline: g.deadline || null,
            created_at: g.createdAt,
          })),
        ),
      },
    );
  }

  if (delta.clearAllTransactions) {
    await sbRestFetch(cfg, session.accessToken, `transactions?${wFilter}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  } else if (delta.deletedTransactionIds.length > 0) {
    await sbRestFetch(
      cfg,
      session.accessToken,
      `transactions?${wFilter}&id=in.${encodeURIComponent(encodeInFilter(delta.deletedTransactionIds))}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
  }
  if (delta.upsertedTransactions.length > 0) {
    const BATCH_SIZE = 500;
    for (let i = 0; i < delta.upsertedTransactions.length; i += BATCH_SIZE) {
      const slice = delta.upsertedTransactions.slice(i, i + BATCH_SIZE);
      await sbRestFetch(
        cfg,
        session.accessToken,
        "transactions?on_conflict=workspace_id,id",
        {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(
            slice.map((t) => ({
              workspace_id: workspaceId,
              id: t.id,
              date: t.date,
              type: t.type,
              category: t.category,
              account_id: t.accountId,
              to_account_id: t.toAccountId || null,
              amount: t.amount,
              note: t.note || "",
              goal_id: t.goalId || null,
              source: t.source || "manual",
              sheet_sync_status: t.sheetSyncStatus || "local_only",
              created_at: t.createdAt,
              updated_at: t.updatedAt,
            })),
          ),
        },
      );
    }
  }

  if (delta.sheetConnectionChanged) {
    const conn = after.sheetConnection;
    await sbRestFetch(
      cfg,
      session.accessToken,
      "google_sheet_connections?on_conflict=workspace_id",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          connected: conn.connected,
          google_email: conn.googleEmail || null,
          spreadsheet_id: conn.spreadsheetId || null,
          spreadsheet_url: conn.spreadsheetUrl || null,
          sheet_tab_name: conn.sheetTabName || "Transaksi",
          sheet_tab_id: conn.sheetTabId ?? null,
          encrypted_refresh_token: conn.encryptedRefreshToken || null,
          last_synced_at: conn.lastSyncedAt || null,
          last_error: conn.lastError || null,
          pending_deletes: conn.pendingDeletes ?? [],
          updated_at: new Date().toISOString(),
        }),
      },
    );
  }
}
