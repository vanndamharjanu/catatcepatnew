# CatatCepat SaaS Design Direction

## Design Read
Reading this as: Mobile-first personal finance SaaS workspace for Indonesian everyday earners and spreadsheet users, in a Deep Maroon tactile fintech style with custom Gurita ("Guri") mascot companion, dial ENERGY 2 / RHYTHM 2 / MOTION 2.

## Three Dials
- **ENERGY 2 (Balanced)**: Confident Deep Maroon hero card anchors the viewport as the single focal point, while surrounding surfaces stay warm blush-white so financial figures remain effortless to scan.
- **RHYTHM 2 (Consistent with breaks)**: Each screen serves one primary job:
  - `Beranda`: Daily safe-to-spend allowance, Guri streak companion, wallet summary, and quick capture.
  - `Riwayat`: Searchable and filterable transaction ledger with month+year filtering, CSV export, and print view.
  - `Tabungan`: Saving goals with direct deposit linked to transaction history.
  - `Statistik`: Spending limit progress, question-driven visual charts, and data-backed Q&A assistant.
- **MOTION 2 (Balanced)**: Crisp bottom-sheet entry, smooth tab switching, progress bar fills, and tactile button press states, all disabled cleanly under `prefers-reduced-motion: reduce`.

## Palette (WCAG AA Verified)
- **Light Canvas**: `#FAF6F7` (warm blush background; reduces sterile white glare)
- **Light Card**: `#FFFFFF` with border `#EDE3E6`
- **Soft Tint**: `#F6E9ED` (category icon tiles and soft chips; `#6E1128` text ratio 10.03:1)
- **Primary Brand Maroon**: `#6E1128` to `#450918` (white text ratio 11.84:1 to 16.09:1)
- **Text Primary / Muted**: `#1F0B10` (17.59:1) / `#694F56` (7.36:1 on white, 6.87:1 on canvas)
- **Semantic Income / Expense**: Emerald `#047857` on `#ECFDF5` (5.21:1) / Rose `#BE123C` on `#FFF1F2` (5.72:1)
- **Dark Mode**: Canvas `#160B0F`, Card `#221117`, Text `#FAF3F5` (16.55:1), Muted `#C8B2B8` (9.06:1), Primary `#8B1835` (9.21:1)

## R-31 Justifications
- **Why Deep Maroon**: Differentiates CatatCepat from green/blue finance apps while conveying reliability and calm authority.
- **Why Plus Jakarta Sans + Tabular Numerals**: Clean geometric legibility for Indonesian copy and aligned Rupiah columns (`tabular-nums`).
- **Why Gurita ("Guri") Mascot**: Multiple tentacles symbolize juggling Cash, Bank, E-Wallet, Tabungan, and Google Sheets simultaneously without overwhelm.
- **Why Custom Duotone SVG Icons**: Avoids generic thin-stroke library look while maintaining consistent 2px rounded geometry tinted in maroon.
