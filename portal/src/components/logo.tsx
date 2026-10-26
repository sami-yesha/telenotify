import { cn } from '@/lib/cn';

// The Telenotify mark: a message bubble with a "T" and a notification dot.
// Same artwork as app/icon.svg (the favicon); keep them in sync.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8 shrink-0', className)} aria-hidden>
      <defs>
        <linearGradient id="tn-logo-gradient" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0ea5e9" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#tn-logo-gradient)" />
      <path
        fill="#fff"
        d="M11.5 8.5H20.5A5 5 0 0 1 25.5 13.5V17A5 5 0 0 1 20.5 22H14.9L10.6 25.1C10 25.55 9.2 25 9.4 24.3L10.1 21.6A5 5 0 0 1 6.5 17V13.5A5 5 0 0 1 11.5 8.5Z"
      />
      <rect x="11" y="11.6" width="10" height="2.6" rx="1.3" fill="url(#tn-logo-gradient)" />
      <rect x="14.7" y="11.6" width="2.6" height="7.6" rx="1.3" fill="url(#tn-logo-gradient)" />
      <circle cx="25" cy="8.5" r="3.6" fill="#f472b6" stroke="url(#tn-logo-gradient)" strokeWidth="2" />
    </svg>
  );
}

export function Logo({ compact, product = 'Telenotify', suffix, className }: { compact?: boolean; product?: string; suffix?: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className="drop-shadow-[0_4px_10px_rgb(14_165_233_/_0.25)]" />
      {!compact && (
        <span className="font-display text-[17px] font-medium tracking-tight text-ink">
          {product}
          {suffix && <span className="ml-1.5 rounded-md bg-subtle px-1.5 py-0.5 align-middle font-sans text-[11px] font-medium text-muted">{suffix}</span>}
        </span>
      )}
    </div>
  );
}
