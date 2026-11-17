import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: "CatatCepat - Pencatat Keuangan Pribadi",
  description:
    "Catat pengeluaran dan pemasukan harian dengan cepat, hitung jatah aman harian, dan sinkronkan otomatis ke Google Sheets pribadi.",
};

// R-39: Allow user zoom cleanly without maximum-scale=1 or user-scalable=no
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#6E1128",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={plusJakarta.variable} suppressHydrationWarning>
      <body className="font-[family-name:var(--font-jakarta),system-ui,sans-serif] antialiased min-h-dvh">
        {children}
      </body>
    </html>
  );
}
