import type { Metadata } from "next";
import Link from "next/link";
import { OctopusMascot } from "@/components/OctopusMascot";
import { APP_SLOGAN } from "@/lib/types";

export const metadata: Metadata = {
  title: "Ketentuan Layanan",
  description:
    "Syarat dan ketentuan penggunaan aplikasi pencatat keuangan pribadi CatatCepat dan fitur sinkronisasi Google Sheets.",
};

export default function TermsPage() {
  return (
    <div className="min-h-dvh bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-3.5 sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <Link href="/" className="flex min-h-[44px] items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-primary)] text-white">
              <OctopusMascot mood="saving" size={34} />
            </span>
            <div>
              <span className="block text-base font-extrabold text-[var(--text-primary)]">
                CatatCepat
              </span>
              <span className="block text-xs text-[var(--text-muted)]">{APP_SLOGAN}</span>
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

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
        <article className="space-y-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 sm:p-8">
          <div className="border-b border-[var(--border-subtle)] pb-5">
            <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-3xl">
              Ketentuan Layanan CatatCepat
            </h1>
            <p className="mt-2 text-xs font-semibold text-[var(--text-muted)]">
              Terakhir diperbarui: 18 November 2026 · Berlaku untuk pengguna https://catatcepat.web.id
            </p>
          </div>

          <section className="space-y-2 text-sm leading-relaxed text-[var(--text-muted)]">
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">
              1. Ruang Lingkup Layanan
            </h2>
            <p>
              CatatCepat adalah aplikasi web pencatat pemasukan, pengeluaran, target tabungan, dan
              alat bantu pengelolaan anggaran pribadi yang mendukung sinkronisasi ke Google Sheets milik
              pengguna. CatatCepat bukan lembaga jasa keuangan, bank, maupun penasihat investasi atau
              pajak berizin.
            </p>
          </section>

          <section className="space-y-2 text-sm leading-relaxed text-[var(--text-muted)]">
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">
              2. Akun &amp; Tanggung Jawab Pengguna
            </h2>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Anda bertanggung jawab menjaga kerahasiaan akun serta kata sandi Anda (baik login email
                maupun akun Google yang dihubungkan).
              </li>
              <li>
                Hasil pembacaan otomatis dari AI (kalimat singkat, suara, maupun foto struk) disajikan
                sebagai draf terlebih dahulu. Anda bertanggung jawab memeriksa kesesuaian nominal,
                akun dompet, dan kategori sebelum menekan tombol simpan.
              </li>
              <li>
                Pengguna dilarang menyalahgunakan endpoint API atau mencoba mengakses workspace pengguna
                lain.
              </li>
            </ul>
          </section>

          <section className="space-y-2 text-sm leading-relaxed text-[var(--text-muted)]">
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">
              3. Kepemilikan Data &amp; Sinkronisasi Google Sheets
            </h2>
            <p>
              Seluruh catatan transaksi dan file Google Sheets yang dibuat oleh CatatCepat tetap
              menjadi milik Anda sepenuhnya. Anda dapat mengekspor catatan ke format CSV atau
              memutus koneksi Google Sheets kapan saja. Apabila koneksi Google Sheets sedang terganggu
              atau kuota Google API dibatasi sementara, data tetap tersimpan di workspace dan
              disinkronkan kembali pada percobaan berikutnya.
            </p>
          </section>

          <section className="space-y-2 text-sm leading-relaxed text-[var(--text-muted)]">
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">
              4. Ketersediaan &amp; Batasan Layanan
            </h2>
            <p>
              Fitur gratis dapat memiliki batas wajar pemakaian AI harian agar layanan tetap stabil bagi
              seluruh pengguna. Kami terus melakukan pemeliharaan berkala dan berhak memperbarui fitur
              atau ketentuan ini dengan pemberitahuan yang wajar di halaman layanan.
            </p>
          </section>

          <section className="space-y-2 text-sm leading-relaxed text-[var(--text-muted)]">
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">
              5. Kontak
            </h2>
            <p>
              Jika ada pertanyaan mengenai Ketentuan Layanan atau pelaporan kendala akun, hubungi kami
              melalui email{" "}
              <a
                href="mailto:vanndamharjanu@gmail.com"
                className="font-bold text-[var(--brand-primary)] underline dark:text-[#fda4af]"
              >
                vanndamharjanu@gmail.com
              </a>
              .
            </p>
          </section>
        </article>
      </main>

      <footer className="border-t border-[var(--border-subtle)] px-4 py-6 text-center text-xs text-[var(--text-muted)] sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <span>CatatCepat · {APP_SLOGAN}</span>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:underline">
              Kebijakan Privasi
            </Link>
            <Link href="/terms" className="font-bold text-[var(--text-primary)] underline">
              Ketentuan Layanan
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
