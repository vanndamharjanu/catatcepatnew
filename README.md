# CatatCepat SaaS

Versi SaaS dari proyek pencatat keuangan pribadi **CatatCepat** dengan tema **Deep Maroon**, maskot gurita **Guri**, kalkulator **Jatah Harian**, **Catat AI** (suara & teks), **Target Tabungan**, serta sinkronisasi **Google Sheets pribadi** via OAuth (`drive.file`).

## Menjalankan di Lokal

1. Salin `.env.example` menjadi `.env.local` (opsional jika ingin langsung uji Mode Lokal):
   ```bash
   cp .env.example .env.local
   ```
2. Jalankan server development:
   ```bash
   npm run dev
   ```
3. Buka `http://localhost:3000`.

## Uji Kualitas & Build

```bash
npm run lint
npm test
npm run build
```

## Menghubungkan Google Sheets (OAuth 2.0 `drive.file`)

1. Buka Google Cloud Console dan aktifkan **Google Sheets API** serta **Google Drive API**.
2. Buat **OAuth 2.0 Client ID** tipe Web Application.
3. Tambahkan Authorized Redirect URI: `http://localhost:3000/api/sheets/callback`.
4. Isi `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, dan `APP_ENCRYPTION_SECRET` di `.env.local`.
5. Dari aplikasi, klik tombol **Sheets & Atur** lalu pilih **Hubungkan Google Sheets (OAuth)**.

## Migrasi ke Database SaaS Produksi (PostgreSQL / Supabase)

Saat siap beralih dari penyimpanan lokal (`data/catatcepat-db.json`) ke multi-tenant database produksi, jalankan skema tabel dan policy Row-Level Security di `supabase/schema.sql`.
