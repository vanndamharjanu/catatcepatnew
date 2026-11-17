import React from "react";

interface IconProps {
  className?: string;
}

/** Custom cohesive duotone-weight SVG icons tailored for CatatCepat Maroon UI. */
export function HomeIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 19v-8.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M9.5 20.5v-6h5v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ListIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 6.5h12M8 12h12M8 17.5h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="4.5" cy="6.5" r="1.25" fill="currentColor" />
      <circle cx="4.5" cy="12" r="1.25" fill="currentColor" />
      <circle cx="4.5" cy="17.5" r="1.25" fill="currentColor" />
    </svg>
  );
}

export function PiggyIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M19 11c0-3.3-3-5.5-7-5.5S5 7.7 5 11c0 2.3 1.4 4.2 3.5 5l.5 2.5h2.5v-1.7c.5.1 1 .1 1.5.1s1 0 1.5-.1v1.7H17l.4-2.4c1-.7 1.6-1.7 1.6-2.9h1.5v-2.2H19z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path d="M10 8.5h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="15.5" cy="10.8" r="1" fill="currentColor" />
    </svg>
  );
}

export function ChartIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 19.5h15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="6" y="12" width="3" height="5.5" rx="1" fill="currentColor" opacity="0.55" />
      <rect x="10.5" y="8" width="3" height="9.5" rx="1" fill="currentColor" opacity="0.8" />
      <rect x="15" y="5" width="3" height="12.5" rx="1" fill="currentColor" />
    </svg>
  );
}

export function PlusIcon({ className = "w-6 h-6" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function SheetIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="3.5" width="16" height="17" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M4 9.5h16M4 14.5h16M10 9.5v11" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function MicIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3.5" width="6" height="10.5" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function CameraIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.5 8.5A2 2 0 0 1 6.5 6.5h2l1.2-2h4.6l1.2 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-9z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="1.9" />
    </svg>
  );
}

export function ArrowOutIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M6 14L14 6M8 6h6v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowInIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M14 6L6 14M6 8v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TransferIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 7h12l-3-3M16 13H4l3 3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EyeIcon({ off = false, className = "w-4 h-4" }: IconProps & { off?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.7" stroke="currentColor" strokeWidth="1.9" />
      {off && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}

export function ThemeIcon({ dark = false, className = "w-4 h-4" }: IconProps & { dark?: boolean }) {
  if (dark) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
        <path
          d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CloseIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronLeftIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M12.5 5l-5 5 5 5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronRightIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M7.5 5l5 5-5 5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ScaleIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v16M7 20h10M5 8h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M5 8l-2 5h4l-2-5zM19 8l-2 5h4l-2-5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

export function CategoryIcon({ iconKey, className = "w-5 h-5" }: IconProps & { iconKey: string }) {
  switch (iconKey) {
    case "utensils":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 3v7a2.5 2.5 0 0 0 5 0V3M9.5 3v18M17 3v18M17 3c2 2 2 6 0 8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      );
    case "bus":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="5" y="4" width="14" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.9" />
          <path d="M5 11.5h14M7.5 17v2.5M16.5 17v2.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          <circle cx="8.5" cy="14.2" r="1" fill="currentColor" />
          <circle cx="15.5" cy="14.2" r="1" fill="currentColor" />
        </svg>
      );
    case "basket":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4.5 10h15l-1.5 8.5h-12L4.5 10zM8 10l4-5 4 5" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        </svg>
      );
    case "gift":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="4.5" y="9" width="15" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.9" />
          <path d="M12 9v11M4.5 13h15M12 9c-2 0-3.5-1.2-3.5-2.6S10 4 12 6.5c2-2.5 3.5-1.5 3.5-.1S14 9 12 9z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case "phone":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="7" y="3.5" width="10" height="17" rx="2.2" stroke="currentColor" strokeWidth="1.9" />
          <path d="M11 17.5h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "receipt":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 3.5h12v17l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5v-17z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
          <path d="M9 8.5h6M9 12.5h6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      );
    case "piggy":
      return <PiggyIcon className={className} />;
    case "briefcase":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3.5" y="7.5" width="17" height="12" rx="2" stroke="currentColor" strokeWidth="1.9" />
          <path d="M8.5 7.5v-2a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v2" stroke="currentColor" strokeWidth="1.9" />
        </svg>
      );
    case "medal":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="10" r="5" stroke="currentColor" strokeWidth="1.9" />
          <path d="M9.5 14.5l-1 6 3.5-2 3.5 2-1-6" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        </svg>
      );
    case "cap":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 10l9-4.5L21 10l-9 4.5L3 10z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
          <path d="M7 12v4.5c0 1.2 2.2 2.5 5 2.5s5-1.3 5-2.5V12" stroke="currentColor" strokeWidth="1.9" />
        </svg>
      );
    case "star":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 4l2.2 4.9 5.3.6-3.9 3.6 1 5.2L12 15.7 7.4 18.3l1-5.2L4.5 9.5l5.3-.6L12 4z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        </svg>
      );
    case "heart":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 19.5s-7-4.4-7-9.5a4.2 4.2 0 0 1 7-3.1A4.2 4.2 0 0 1 19 10c0 5.1-7 9.5-7 9.5z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        </svg>
      );
    case "wallet":
    case "bag":
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4.5 7.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-9z" stroke="currentColor" strokeWidth="1.9" />
          <path d="M15.5 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
  }
}
