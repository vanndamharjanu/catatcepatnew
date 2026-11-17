import React from "react";
import type { StreakInfo } from "@/lib/finance";

export type GuriMood = "saving" | "careful" | "empty" | "ai";

interface OctopusMascotProps {
  mood?: GuriMood;
  accessory?: StreakInfo["accessory"];
  size?: number;
  className?: string;
}

/**
 * Custom Maroon Octopus mascot ("Guri") whose expression reacts to budget health
 * and whose accessories unlock as recording streak milestones grow.
 */
export function OctopusMascot({
  mood = "saving",
  accessory = "none",
  size = 84,
  className = "",
}: OctopusMascotProps) {
  const isCareful = mood === "careful";
  const isAi = mood === "ai";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={className}
      role="img"
      aria-label={`Maskot Gurita Guri sedang mode ${mood}`}
    >
      {/* Subtle seabed shadow */}
      <ellipse cx="60" cy="107" rx="34" ry="5" fill="#450918" opacity="0.16" />

      {/* Back tentacles */}
      <path
        d="M28 76c-8 6-12 16-6 22 4 4 11 1 11-4 0-3-3-5-2-8"
        fill="#580D20"
      />
      <path
        d="M92 76c8 6 12 16 6 22-4 4-11 1-11-4 0-3 3-5 2-8"
        fill="#580D20"
      />

      {/* Main octopus dome & front curled tentacles */}
      <path
        d="M26 52c0-20 15-34 34-34s34 14 34 34c0 10-3 18-9 23 3 6 7 11 12 12 4 1 6-2 6-5 0-2 2-3.5 4-3.5s3.5 1.8 3.5 4.2c0 6.5-5.8 11.3-13 11.3-6.5 0-12.3-3.4-16.5-9.2-2.2.8-4.5 1.3-7 1.5.7 5.5-2.2 11.2-7.5 11.2-4.2 0-7.2-3.2-7.2-7.3 0-1.9.7-3.4 1.6-4.6-2.5-.3-5-.9-7.2-1.8-4 6-9.8 10.2-16.7 10.2-7.2 0-13-4.8-13-11.3 0-2.4 1.5-4.2 3.5-4.2s4 1.5 4 3.5c0 3 2 6 6 5 5-1 9-6 12-12-6-5-9-13-9-23z"
        fill="#7E1630"
      />

      {/* Soft highlight on dome */}
      <ellipse cx="47" cy="33" rx="11" ry="6" transform="rotate(-22 47 33)" fill="#A62848" opacity="0.55" />

      {/* Warm cream-blush face patch */}
      <ellipse cx="60" cy="60" rx="22" ry="15" fill="#FBECEF" opacity="0.92" />

      {/* Cheek blushes */}
      <circle cx="42" cy="61" r="4" fill="#F29CB0" opacity="0.7" />
      <circle cx="78" cy="61" r="4" fill="#F29CB0" opacity="0.7" />

      {/* Eyes based on mood */}
      {isCareful ? (
        <>
          <path d="M44 51l8 2" stroke="#2D0A12" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M76 51l-8 2" stroke="#2D0A12" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="48" cy="57" r="3.4" fill="#2D0A12" />
          <circle cx="72" cy="57" r="3.4" fill="#2D0A12" />
          <circle cx="49" cy="56" r="1.1" fill="#FFFFFF" />
          <circle cx="73" cy="56" r="1.1" fill="#FFFFFF" />
          <path d="M55 66c2.5-2 7.5-2 10 0" stroke="#450918" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <circle cx="48" cy="56" r="4.2" fill="#2D0A12" />
          <circle cx="72" cy="56" r="4.2" fill="#2D0A12" />
          <circle cx="49.5" cy="54.4" r="1.5" fill="#FFFFFF" />
          <circle cx="73.5" cy="54.4" r="1.5" fill="#FFFFFF" />
          <path
            d={mood === "empty" ? "M56 64.5h8" : "M54 64c3 3 9 3 12 0"}
            stroke="#450918"
            strokeWidth="2.4"
            strokeLinecap="round"
            fill="none"
          />
        </>
      )}

      {/* Gold Rupiah medallion held in lower tentacle when saving */}
      {mood === "saving" && (
        <g transform="translate(80, 74)">
          <circle cx="10" cy="10" r="10" fill="#D97706" stroke="#FEF3C7" strokeWidth="1.5" />
          <text
            x="10"
            y="13.5"
            textAnchor="middle"
            fontSize="9"
            fontWeight="800"
            fill="#FFFFFF"
            fontFamily="sans-serif"
          >
            Rp
          </text>
        </g>
      )}

      {/* AI Headphone gear when in AI mode */}
      {isAi && (
        <g>
          <path d="M23 53c0-21 16-36 37-36s37 15 37 36" stroke="#0F766E" strokeWidth="4.5" fill="none" strokeLinecap="round" />
          <rect x="17" y="47" width="9" height="16" rx="4.5" fill="#0F766E" stroke="#CCFBF1" strokeWidth="1.5" />
          <rect x="94" y="47" width="9" height="16" rx="4.5" fill="#0F766E" stroke="#CCFBF1" strokeWidth="1.5" />
        </g>
      )}

      {/* Streak-unlocked accessories */}
      {accessory === "glasses" && (
        <g stroke="#2D0A12" strokeWidth="2.2" fill="rgba(255,255,255,0.28)">
          <rect x="39" y="49" width="17" height="13" rx="4" />
          <rect x="64" y="49" width="17" height="13" rx="4" />
          <path d="M56 55h8" strokeLinecap="round" />
        </g>
      )}

      {accessory === "headband" && (
        <g>
          <path d="M29 39c18-5 44-5 62 0l-2 7c-18-4-40-4-58 0z" fill="#0F766E" />
          <rect x="52" y="34" width="16" height="9" rx="2.5" fill="#E2E8F0" stroke="#475569" strokeWidth="1.2" />
        </g>
      )}

      {accessory === "crown" && (
        <path
          d="M42 22l5-10 13 7 13-7 5 10z"
          fill="#F59E0B"
          stroke="#78350F"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

interface GuriHabitatCardProps {
  streak: StreakInfo;
  mood: GuriMood;
  message: string;
  onOpenCatat: () => void;
}

/** Streak and mascot companion card on Beranda showing real daily consistency. */
export function GuriHabitatCard({
  streak,
  mood,
  message,
  onOpenCatat,
}: GuriHabitatCardProps) {
  const milestones = [
    { days: 3, label: "Kacamata" },
    { days: 7, label: "Ikat Fokus" },
    { days: 14, label: "Mahkota" },
  ];

  const progressPct = Math.min(100, Math.round((streak.streakDays / 14) * 100));

  return (
    <section
      aria-label="Status streak dan pendamping Guri"
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-xs"
    >
      <div className="flex items-center gap-3.5">
        <div className="shrink-0 rounded-2xl bg-[var(--bg-soft)] p-1.5">
          <OctopusMascot mood={mood} accessory={streak.accessory} size={74} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              Guri {streak.accessory !== "none" ? `(${streak.accessoryLabel})` : "si Gurita"}
            </h2>
            <span className="rounded-full bg-[var(--bg-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--brand-primary)] dark:text-[#fda4af] tabular-nums">
              Streak {streak.streakDays} hari
            </span>
          </div>

          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
            {message}
          </p>

          {/* Streak progress bar toward 14-day crown */}
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-soft)]">
              <div
                className="h-full rounded-full bg-[var(--brand-primary)] transition-all duration-300"
                style={{ width: `${Math.max(progressPct, streak.streakDays > 0 ? 10 : 0)}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] font-medium text-[var(--text-muted)]">
              {milestones.map((m) => {
                const unlocked = streak.streakDays >= m.days;
                return (
                  <span
                    key={m.days}
                    className={
                      unlocked
                        ? "font-bold text-[var(--brand-primary)] dark:text-[#fda4af]"
                        : ""
                    }
                  >
                    {m.days}h: {m.label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {!streak.recordedToday && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-[var(--bg-soft)] px-3 py-2">
          <span className="text-xs font-medium text-[var(--text-primary)]">
            Belum ada catatan hari ini. Catat 1 transaksi untuk menyambung streak.
          </span>
          <button
            type="button"
            onClick={onOpenCatat}
            className="shrink-0 rounded-lg bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--brand-hover)]"
          >
            Catat
          </button>
        </div>
      )}
    </section>
  );
}
