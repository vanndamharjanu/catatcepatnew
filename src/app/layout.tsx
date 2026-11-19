import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { APP_SLOGAN } from "@/lib/types";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-jakarta",
});

const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://catatcepat.web.id").replace(
  /\/+$/,
  "",
);

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `CatatCepat - ${APP_SLOGAN}`,
    template: "%s | CatatCepat",
  },
  description:
    "Catat pengeluaran dan pemasukan lewat suara, chat AI, atau foto struk. Hitung jatah aman harian otomatis dan sinkronkan langsung ke Google Sheets pribadi Anda.",
  alternates: {
    canonical: "/",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CatatCepat",
  },
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: "/",
    siteName: "CatatCepat",
    title: `CatatCepat - ${APP_SLOGAN}`,
    description:
      "Catat pengeluaran dan pemasukan lewat suara, chat AI, atau foto struk. Hitung jatah aman harian otomatis dan sinkronkan ke Google Sheets pribadi.",
    images: [
      {
        url: "/og-catatcepat.png",
        width: 1200,
        height: 630,
        alt: `CatatCepat - ${APP_SLOGAN}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `CatatCepat - ${APP_SLOGAN}`,
    description:
      "Catat pengeluaran lewat suara, chat AI, atau foto struk. Jatah aman harian otomatis & sinkron ke Google Sheets pribadi.",
    images: ["/og-catatcepat.png"],
  },
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
