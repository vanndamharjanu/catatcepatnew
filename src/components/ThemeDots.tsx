"use client";

import React from "react";
import { THEME_OPTIONS, type ThemeKey } from "@/lib/types";

interface ThemeDotsProps {
  value: ThemeKey;
  onChange: (theme: ThemeKey) => void;
  showLabel?: boolean;
  compact?: boolean;
}

/** Custom color theme dot switcher inspired by classic CatatCepat with accessible contrast tokens. */
export function ThemeDots({
  value,
  onChange,
  showLabel = true,
  compact = false,
}: ThemeDotsProps) {
  return (
    <div
      role="group"
      aria-label="Pilih warna tema aplikasi"
      className={`inline-flex flex-wrap items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] ${
        compact ? "gap-2.5 px-3 py-1.5" : "gap-2.5 px-3.5 py-2 sm:gap-3.5 sm:px-4"
      }`}
    >
      {showLabel && (
        <span className="mr-1 text-[11px] font-bold text-[var(--text-muted)]">
          Tema:
        </span>
      )}
      {THEME_OPTIONS.map((opt) => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            aria-label={`Tema ${opt.label}`}
            aria-pressed={active}
            title={`Tema ${opt.label}`}
            style={{ backgroundColor: opt.swatch }}
            className={`relative shrink-0 rounded-full transition-transform after:content-[""] ${
              compact ? "h-5 w-5 after:absolute after:-inset-1" : "h-6 w-6 after:absolute after:-inset-1.5"
            } ${
              active
                ? "scale-110 ring-2 ring-[var(--text-primary)] ring-offset-2 ring-offset-[var(--bg-card)]"
                : "opacity-85 hover:scale-105 hover:opacity-100"
            }`}
          />
        );
      })}
    </div>
  );
}
