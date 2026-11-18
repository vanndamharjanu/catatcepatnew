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
      className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] ${
        compact ? "px-2 py-1" : "px-3 py-1.5"
      }`}
    >
      {showLabel && (
        <span className="mr-0.5 text-[11px] font-bold text-[var(--text-muted)]">
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
            className={`relative rounded-full transition-transform after:absolute after:-inset-1.5 after:content-[""] ${
              compact ? "h-5 w-5" : "h-6 w-6"
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
