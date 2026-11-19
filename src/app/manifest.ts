import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CatatCepat - Catat 3 Detik, Rapi di Sheets",
    short_name: "CatatCepat",
    description:
      "Catat pengeluaran dan pemasukan cepat 1 layar, lewat suara atau foto struk, dengan jatah aman harian dan sinkron Google Sheets pribadi.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF6F7",
    theme_color: "#6E1128",
    orientation: "portrait-primary",
    lang: "id",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
