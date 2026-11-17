-- Skema Database Multi-Tenant SaaS CatatCepat (PostgreSQL / Supabase)
-- Jalankan file ini di Supabase SQL Editor saat bermigrasi dari penyimpanan lokal ke produksi.

create extension if not exists "pgcrypto";

-- 1. Profil & Langganan SaaS
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null default 'Keuangan Pribadi',
  monthly_budget bigint not null default 3000000 check (monthly_budget >= 0),
  payday_day smallint not null default 25 check (payday_day between 1 and 31),
  plan text not null default 'free' check (plan in ('free', 'pro')),
  ai_credits_remaining integer not null default 20,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Akun / Dompet (Tunai, Rekening Bank, E-Wallet)
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('cash', 'bank', 'ewallet')),
  initial_balance bigint not null default 0,
  created_at timestamptz not null default now()
);

-- 3. Kategori Kustom per Workspace
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  type text not null check (type in ('Masuk', 'Keluar')),
  icon_key text not null default 'tag',
  unique (workspace_id, type, name)
);

-- 4. Target Tabungan
create table if not exists public.saving_goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  target_amount bigint not null check (target_amount > 0),
  current_amount bigint not null default 0 check (current_amount >= 0),
  deadline date,
  created_at timestamptz not null default now()
);

-- 5. Transaksi (UUID dipakai sebagai kunci sinkronisasi ke Google Sheets agar tidak salah baris)
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  date date not null,
  type text not null check (type in ('Masuk', 'Keluar', 'Transfer', 'Koreksi')),
  category text not null,
  account_id uuid references public.accounts(id) on delete set null,
  to_account_id uuid references public.accounts(id) on delete set null,
  amount bigint not null check (amount > 0),
  note text not null default '',
  goal_id uuid references public.saving_goals(id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'ai_text', 'ai_voice', 'receipt', 'import_csv', 'whatsapp', 'reconciliation')),
  sheet_sync_status text not null default 'pending' check (sheet_sync_status in ('pending', 'synced', 'failed', 'disabled')),
  sheet_row_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_transactions_workspace_date
  on public.transactions(workspace_id, date desc, created_at desc);

-- 6. Koneksi OAuth Google Sheets (scope: drive.file)
create table if not exists public.google_sheet_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  google_email text,
  spreadsheet_id text not null,
  spreadsheet_url text not null,
  sheet_tab_name text not null default 'Transaksi',
  encrypted_refresh_token text not null,
  last_synced_at timestamptz,
  status text not null default 'active' check (status in ('active', 'revoked', 'error')),
  created_at timestamptz not null default now()
);

-- 7. Log Sinkronisasi & Audit
create table if not exists public.sync_logs (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  action text not null check (action in ('create_sheet', 'append', 'update', 'delete', 'bulk_sync')),
  status text not null check (status in ('success', 'error')),
  message text,
  created_at timestamptz not null default now()
);

-- Aktifkan Row-Level Security (RLS) untuk keamanan isolasi tenant
alter table public.workspaces enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.saving_goals enable row level security;
alter table public.transactions enable row level security;
alter table public.google_sheet_connections enable row level security;
alter table public.sync_logs enable row level security;

create policy "Owner accesses own workspace"
  on public.workspaces for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Workspace member accesses accounts"
  on public.accounts for all
  using (workspace_id in (select id from public.workspaces where owner_id = auth.uid()));

create policy "Workspace member accesses categories"
  on public.categories for all
  using (workspace_id in (select id from public.workspaces where owner_id = auth.uid()));

create policy "Workspace member accesses goals"
  on public.saving_goals for all
  using (workspace_id in (select id from public.workspaces where owner_id = auth.uid()));

create policy "Workspace member accesses transactions"
  on public.transactions for all
  using (workspace_id in (select id from public.workspaces where owner_id = auth.uid()));

create policy "Workspace member accesses sheets"
  on public.google_sheet_connections for all
  using (workspace_id in (select id from public.workspaces where owner_id = auth.uid()));

create policy "Workspace member reads sync logs"
  on public.sync_logs for select
  using (workspace_id in (select id from public.workspaces where owner_id = auth.uid()));
