/* SF Symbols-like line icons for the tab bar (24×24, currentColor). */
interface IconProps {
  filled?: boolean;
}

const base = { width: 26, height: 26, viewBox: '0 0 24 24', 'aria-hidden': true } as const;

export function TodayIcon({ filled }: IconProps) {
  return (
    <svg {...base}>
      <rect x="3.5" y="4.5" width="17" height="16" rx="3.5" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 9.5h17" stroke={filled ? 'var(--color-bg)' : 'currentColor'} strokeWidth="1.6" />
      <path d="M8 3v3M16 3v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="15" r="1.8" fill={filled ? 'var(--color-bg)' : 'currentColor'} />
    </svg>
  );
}

export function ListIcon({ filled }: IconProps) {
  const w = filled ? 2.2 : 1.6;
  return (
    <svg {...base}>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" stroke="currentColor" strokeWidth={w} strokeLinecap="round" />
      <circle cx="4.5" cy="6.5" r="1.3" fill="currentColor" />
      <circle cx="4.5" cy="12" r="1.3" fill="currentColor" />
      <circle cx="4.5" cy="17.5" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function ChartIcon({ filled }: IconProps) {
  return (
    <svg {...base}>
      <rect x="4" y="12" width="4" height="8" rx="1.2" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" />
      <rect x="10" y="4" width="4" height="16" rx="1.2" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" />
      <rect x="16" y="8.5" width="4" height="11.5" rx="1.2" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function GaugeIcon({ filled }: IconProps) {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="8.5" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 12l4-4"
        stroke={filled ? 'var(--color-bg)' : 'currentColor'}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="1.6" fill={filled ? 'var(--color-bg)' : 'currentColor'} />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function GearIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M19.4 13.5a7.7 7.7 0 000-3l2-1.5-2-3.4-2.3.9a7.6 7.6 0 00-2.6-1.5L14 2.6h-4l-.5 2.4a7.6 7.6 0 00-2.6 1.5l-2.3-.9-2 3.4 2 1.5a7.7 7.7 0 000 3l-2 1.5 2 3.4 2.3-.9a7.6 7.6 0 002.6 1.5l.5 2.4h4l.5-2.4a7.6 7.6 0 002.6-1.5l2.3.9 2-3.4-2-1.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DeleteBackIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 5h10a2 2 0 012 2v10a2 2 0 01-2 2H9l-6-7 6-7z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M11.5 9.5l5 5M16.5 9.5l-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function FaceIdIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 8V5a2 2 0 012-2h3M16 3h3a2 2 0 012 2v3M21 16v3a2 2 0 01-2 2h-3M8 21H5a2 2 0 01-2-2v-3" />
      <path d="M8.5 9v1.5M15.5 9v1.5M12 9v4h-1M9 16c1.7 1.3 4.3 1.3 6 0" />
    </svg>
  );
}

/** Open eye: amounts are visible (tap to hide). */
export function EyeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Crossed eye: amounts are hidden (tap to show). */
export function EyeOffIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 5.7A10.6 10.6 0 0112 5.5c6.4 0 10 6.5 10 6.5a17.6 17.6 0 01-2.9 3.7M6.6 6.9C3.7 8.7 2 12 2 12s3.6 6.5 10 6.5c1.6 0 3-.4 4.3-1" />
      <path d="M9.9 9.9a3 3 0 004.2 4.2" />
      <path d="M3 3l18 18" />
    </svg>
  );
}
