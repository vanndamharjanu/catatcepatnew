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

      {/* Back tentacles (symmetric outer depth layer) */}
      <path
        d="M35 72 C24 75 16 83 18 91 C19.5 95 25 94 28 89 C31 84 34 80 39 77"
        fill="none"
        stroke="#580D20"
        strokeWidth="9.5"
        strokeLinecap="round"
      />
      <path
        d="M85 72 C96 75 104 83 102 91 C100.5 95 95 94 92 89 C89 84 86 80 81 77"
        fill="none"
        stroke="#580D20"
        strokeWidth="9.5"
        strokeLinecap="round"
      />

      {/* Front curled tentacles (symmetric rounded curves) */}
      <path
        d="M42 73 C37 84 31 92 24 91 C20.5 90.5 20 86.5 22.5 84.5"
        fill="none"
        stroke="#7E1630"
        strokeWidth="10.5"
        strokeLinecap="round"
      />
      <path
        d="M53 74 C51 84 49 91 46 95"
        fill="none"
        stroke="#7E1630"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M67 74 C69 84 71 91 74 95"
        fill="none"
        stroke="#7E1630"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M78 73 C83 84 89 92 96 91 C99.5 90.5 100 86.5 97.5 84.5"
        fill="none"
        stroke="#7E1630"
        strokeWidth="10.5"
        strokeLinecap="round"
      />

      {/* Full symmetric rounded octopus dome */}
      <path
        d="M27 53 C27 31 41 19 60 19 C79 19 93 31 93 53 C93 67 84 76 72 78 L48 78 C36 76 27 67 27 53 Z"
        fill="#7E1630"
      />

      {/* Soft highlight inside upper-left dome */}
      <ellipse cx="46" cy="32" rx="10" ry="5" transform="rotate(-24 46 32)" fill="#A62848" opacity="0.55" />

      {/* Warm cream-blush face patch */}
      <ellipse cx="60" cy="57" rx="22" ry="15.5" fill="#FBECEF" opacity="0.95" />

      {/* Cheek blushes */}
      <circle cx="42.5" cy="59" r="3.8" fill="#F29CB0" opacity="0.72" />
      <circle cx="77.5" cy="59" r="3.8" fill="#F29CB0" opacity="0.72" />

      {/* Eyes based on mood */}
      {isCareful ? (
        <>
          <path d="M44 49l8 2" stroke="#2D0A12" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M76 49l-8 2" stroke="#2D0A12" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="48" cy="55" r="3.4" fill="#2D0A12" />
          <circle cx="72" cy="55" r="3.4" fill="#2D0A12" />
          <circle cx="49" cy="54" r="1.1" fill="#FFFFFF" />
          <circle cx="73" cy="54" r="1.1" fill="#FFFFFF" />
          <path d="M55 64c2.5-2 7.5-2 10 0" stroke="#450918" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <circle cx="48" cy="54" r="4.1" fill="#2D0A12" />
          <circle cx="72" cy="54" r="4.1" fill="#2D0A12" />
          <circle cx="49.5" cy="52.4" r="1.45" fill="#FFFFFF" />
          <circle cx="73.5" cy="52.4" r="1.45" fill="#FFFFFF" />
          <path
            d={mood === "empty" ? "M56 62.5h8" : "M54 61.5c3 3 9 3 12 0"}
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
          <path d="M24 52c0-20 15-35 36-35s36 15 36 35" stroke="#0F766E" strokeWidth="4.5" fill="none" strokeLinecap="round" />
          <rect x="18" y="46" width="9" height="16" rx="4.5" fill="#0F766E" stroke="#CCFBF1" strokeWidth="1.5" />
          <rect x="93" y="46" width="9" height="16" rx="4.5" fill="#0F766E" stroke="#CCFBF1" strokeWidth="1.5" />
        </g>
      )}

      {/* Streak-unlocked accessories */}
      {accessory === "glasses" && (
        <g stroke="#2D0A12" strokeWidth="2.2" fill="rgba(255,255,255,0.28)">
          <rect x="39" y="47" width="17" height="13" rx="4" />
          <rect x="64" y="47" width="17" height="13" rx="4" />
          <path d="M56 53h8" strokeLinecap="round" />
        </g>
      )}

      {accessory === "headband" && (
        <g>
          <path d="M30 39c18-5 42-5 60 0l-2 7c-18-4-38-4-56 0z" fill="#0F766E" />
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
