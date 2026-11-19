-- Skema Database Multi-Tenant SaaS CatatCepat (PostgreSQL / Supabase)
-- Cara pakai: Salin seluruh isi file ini ke Supabase Dashboard -> SQL Editor -> New Query -> klik Run.

create extension if not exists "pgcrypto";

-- 1. Profil Workspace & Langganan SaaS (1 user = 1 workspace utama)
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique,
  name text not null default 'Keuangan Pribadi',
  monthly_budget bigint not null default 3000000 check (monthly_budget >= 0),
  payday_day smallint not null default 1 check (payday_day between 1 and 31),
  plan text not null default 'free' check (plan in ('free', 'pro')),
  category_preset text not null default 'asn_karyawan' check (category_preset in ('umum', 'asn_karyawan', 'mahasiswa', 'freelancer')),
  ai_credits_remaining integer not null default 20,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Akun / Dompet (Tunai, Rekening Bank, E-Wallet)
create table if not exists public.accounts (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  name text not null,
  kind text not null check (kind in ('cash', 'bank', 'ewallet')),
  initial_balance bigint not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

-- 3. Kategori Kustom per Workspace
create table if not exists public.categories (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  name text not null,
  type text not null check (type in ('Masuk', 'Keluar')),
  icon_key text not null default 'tag',
  sort_order integer not null default 0,
  primary key (workspace_id, id),
  unique (workspace_id, type, name)
);

-- 4. Target Tabungan
create table if not exists public.saving_goals (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  name text not null,
  target_amount bigint not null check (target_amount > 0),
  current_amount bigint not null default 0 check (current_amount >= 0),
  deadline date,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

-- 5. Transaksi (UUID dipakai sebagai kunci sinkronisasi ke Google Sheets agar tidak salah baris)
create table if not exists public.transactions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  date date not null,
  type text not null check (type in ('Masuk', 'Keluar', 'Transfer', 'Koreksi')),
  category text not null,
  account_id text not null,
  to_account_id text,
  amount bigint not null check (amount > 0),
  note text not null default '',
  goal_id text,
  source text not null default 'manual' check (source in ('manual', 'ai_text', 'ai_voice', 'receipt', 'import_csv', 'whatsapp', 'reconciliation')),
  sheet_sync_status text not null default 'pending' check (sheet_sync_status in ('pending', 'synced', 'local_only', 'failed', 'disabled')),
  sheet_row_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create index if not exists idx_transactions_workspace_date
  on public.transactions(workspace_id, date desc, created_at desc);

-- 6. Koneksi OAuth Google Sheets (scope: drive.file)
create table if not exists public.google_sheet_connections (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  connected boolean not null default false,
  google_email text,
  spreadsheet_id text,
  spreadsheet_url text,
  sheet_tab_name text not null default 'Transaksi',
  sheet_tab_id integer,
  encrypted_refresh_token text,
  last_synced_at timestamptz,
  last_error text,
  pending_deletes text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- 7. Log Sinkronisasi & Audit
create table if not exists public.sync_logs (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  transaction_id text,
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

drop policy if exists "Owner accesses own workspace" on public.workspaces;
create policy "Owner accesses own workspace"
  on public.workspaces for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "Workspace member accesses accounts" on public.accounts;
create policy "Workspace member accesses accounts"
  on public.accounts for all
  using (workspace_id in (select id from public.workspaces where owner_id = auth.uid()))
  with check (workspace_id in (select id from public.workspaces where owner_id = auth.uid()));

drop policy if exists "Workspace member accesses categories" on public.categories;
create policy "Workspace member accesses categories"
  on public.categories for all
  using (workspace_id in (select id from public.workspaces where owner_id = auth.uid()))
  with check (workspace_id in (select id from public.workspaces where owner_id = auth.uid()));

drop policy if exists "Workspace member accesses goals" on public.saving_goals;
create policy "Workspace member accesses goals"
  on public.saving_goals for all
  using (workspace_id in (select id from public.workspaces where owner_id = auth.uid()))
  with check (workspace_id in (select id from public.workspaces where owner_id = auth.uid()));

drop policy if exists "Workspace member accesses transactions" on public.transactions;
create policy "Workspace member accesses transactions"
  on public.transactions for all
  using (workspace_id in (select id from public.workspaces where owner_id = auth.uid()))
  with check (workspace_id in (select id from public.workspaces where owner_id = auth.uid()));

drop policy if exists "Workspace member accesses sheets" on public.google_sheet_connections;
create policy "Workspace member accesses sheets"
  on public.google_sheet_connections for all
  using (workspace_id in (select id from public.workspaces where owner_id = auth.uid()))
  with check (workspace_id in (select id from public.workspaces where owner_id = auth.uid()));

drop policy if exists "Workspace member reads sync logs" on public.sync_logs;
create policy "Workspace member reads sync logs"
  on public.sync_logs for all
  using (workspace_id in (select id from public.workspaces where owner_id = auth.uid()))
  with check (workspace_id in (select id from public.workspaces where owner_id = auth.uid()));
