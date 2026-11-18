import type { Metadata } from "next";
import Link from "next/link";
import { OctopusMascot } from "@/components/OctopusMascot";

export const metadata: Metadata = {
  title: "Kebijakan Privasi",
  description:
    "Penjelasan lengkap bagaimana CatatCepat mengumpulkan, menggunakan, melindungi, dan menghapus data akun, catatan keuangan, serta akses Google Sheets Anda.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-3.5 sm:px-8">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <Link href="/" className="flex min-h-[44px] items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--brand-primary)] text-white">
              <OctopusMascot mood="saving" size={34} />
            </span>
            <div>
              <span className="block text-base font-extrabold text-[var(--text-primary)]">
                CatatCepat
              </span>
              <span className="block text-xs text-[var(--text-muted)]">catatcepat.web.id</span>
            </div>
          </Link>

          <Link
            href="/"
            className="flex min-h-[44px] items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
          >
            Kembali ke Beranda
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-8 sm:py-12">
        <article className="space-y-6 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 sm:p-8">
          <div className="border-b border-[var(--border-subtle)] pb-5">
            <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-3xl">
              Kebijakan Privasi CatatCepat
            </h1>
            <p className="mt-2 text-xs font-semibold text-[var(--text-muted)]">
              Terakhir diperbarui: 18 November 2026 · Berlaku untuk layanan di https://catatcepat.web.id
            </p>
          </div>

          <section className="space-y-2 text-sm leading-relaxed text-[var(--text-muted)]">
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">
              1. Informasi yang Kami Kumpulkan
            </h2>
            <p>
              CatatCepat hanya mengumpulkan data yang diperlukan agar Anda dapat mencatat keuangan
              dan menyinkronkannya ke akun Anda sendiri:
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong className="text-[var(--text-primary)]">Data Akun:</strong> Alamat email dan
                ID pengguna saat Anda mendaftar atau masuk melalui email/password maupun Google Sign-In.
              </li>
              <li>
                <strong className="text-[var(--text-primary)]">Data Catatan Keuangan:</strong>{" "}
                Transaksi pemasukan, pengeluaran, transfer, koreksi saldo, nama dompet/akun, kategori,
                target tabungan, dan pengaturan siklus anggaran yang Anda masukkan.
              </li>
              <li>
                <strong className="text-[var(--text-primary)]">Data Koneksi Google Sheets:</strong>{" "}
                Email akun Google yang Anda hubungkan, ID serta URL file spreadsheet yang dibuat oleh
                CatatCepat, dan token penyegaran (refresh token) terenkripsi.
              </li>
            </ul>
          </section>

          <section className="space-y-2 text-sm leading-relaxed text-[var(--text-muted)]">
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">
              2. Penggunaan Google API Services &amp; Izin Drive Terbatas (drive.file)
            </h2>
            <p>
              Untuk fitur sinkronisasi Google Sheets, CatatCepat menggunakan scope non-sensitif{" "}
              <code className="break-all rounded bg-[var(--bg-soft)] px-1.5 py-0.5 text-xs font-bold text-[var(--text-primary)]">
                https://www.googleapis.com/auth/drive.file
              </code>{" "}
              dan{" "}
              <code className="rounded bg-[var(--bg-soft)] px-1.5 py-0.5 text-xs font-bold text-[var(--text-primary)]">
                userinfo.email
              </code>
              . Dengan izin ini:
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                CatatCepat hanya dapat membuat dan memperbarui file spreadsheet yang dibuat langsung
                oleh aplikasi CatatCepat di Google Drive Anda.
              </li>
              <li>
                CatatCepat <strong className="text-[var(--text-primary)]">tidak pernah</strong>{" "}
                melihat, membaca, mengunduh, atau menghapus file Google Drive pribadi Anda yang lain.
              </li>
              <li>
                Penggunaan dan transfer informasi yang diterima CatatCepat dari Google API mematuhi{" "}
                <strong className="text-[var(--text-primary)]">
                  Google API Services User Data Policy
                </strong>
                , termasuk persyaratan <em>Limited Use</em>.
              </li>
              <li>
                Kami tidak menjual data Google Workspace Anda, tidak menggunakannya untuk iklan, dan
                tidak menggunakannya untuk melatih model AI publik/umum.
              </li>
            </ul>
          </section>

          <section className="space-y-2 text-sm leading-relaxed text-[var(--text-muted)]">
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">
              3. Pemrosesan Fitur AI (Teks, Suara &amp; Scan Foto Struk)
            </h2>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong className="text-[var(--text-primary)]">Rekam Suara:</strong> Ditransfer
                menjadi teks secara lokal di browser Anda (Web Speech API) sebelum diproses menjadi draf
                transaksi.
              </li>
              <li>
                <strong className="text-[var(--text-primary)]">Scan Struk &amp; Tanya Guri:</strong>{" "}
                Saat Anda menekan tombol proses AI, teks atau foto struk dikirim sementara ke API model
                AI (Google Gemini API) semata-mata untuk mengekstrak nominal, kategori, dan jawaban
                ringkasan keuangan Anda. Foto struk tidak disimpan permanen di server kami.
              </li>
            </ul>
          </section>

          <section className="space-y-2 text-sm leading-relaxed text-[var(--text-muted)]">
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">
              4. Penyimpanan &amp; Keamanan Data
            </h2>
            <p>
              Data pengguna di cloud disimpan pada PostgreSQL Supabase dengan isolasi{" "}
              <strong className="text-[var(--text-primary)]">Row-Level Security (RLS)</strong>{" "}
              sehingga setiap pengguna hanya dapat mengakses data miliknya sendiri. Token OAuth Google
              Sheets disimpan dalam bentuk terenkripsi menggunakan algoritma AES-256-GCM.
            </p>
          </section>

          <section className="space-y-2 text-sm leading-relaxed text-[var(--text-muted)]">
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">
              5. Kontrol Pengguna, Pencabutan Akses &amp; Penghapusan Data
            </h2>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Anda dapat memutus koneksi Google Sheets kapan saja melalui tombol{" "}
                <strong className="text-[var(--text-primary)]">Putuskan Koneksi</strong> di dalam
                panel Sheets &amp; Atur atau melalui halaman{" "}
                <strong className="text-[var(--text-primary)]">Keamanan Akun Google</strong> di{" "}
                <code className="break-all rounded bg-[var(--bg-soft)] px-1.5 py-0.5 text-xs font-bold text-[var(--text-primary)]">
                  myaccount.google.com/permissions
                </code>
                .
              </li>
              <li>
                Anda dapat mengekspor data ke CSV atau membersihkan transaksi workspace langsung dari
                aplikasi kapan saja.
              </li>
              <li>
                Untuk permintaan penghapusan akun permanen, silakan kirim email dari alamat terdaftar
                Anda ke{" "}
                <a
                  href="mailto:vanndamharjanu@gmail.com"
                  className="font-bold text-[var(--brand-primary)] underline dark:text-[#fda4af]"
                >
                  vanndamharjanu@gmail.com
                </a>
                .
              </li>
            </ul>
          </section>
        </article>
      </main>

      <footer className="border-t border-[var(--border-subtle)] px-4 py-6 text-center text-xs text-[var(--text-muted)]">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <span>CatatCepat (catatcepat.web.id)</span>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="font-bold text-[var(--text-primary)] underline">
              Kebijakan Privasi
            </Link>
            <Link href="/terms" className="hover:underline">
              Ketentuan Layanan
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
