/** OpenFlow mark: an editor selection frame whose content flows out of it. */
export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" fill="none">
      <rect x="5" y="5" width="22" height="22" rx="2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M9 20c3.2 0 3.8-8 7-8s3.8 8 7 8"
        stroke="#ff7a1a"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <rect x="2.5" y="2.5" width="5" height="5" fill="#2f5bff" />
      <rect x="24.5" y="2.5" width="5" height="5" fill="#2f5bff" />
      <rect x="2.5" y="24.5" width="5" height="5" fill="#2f5bff" />
      <rect x="24.5" y="24.5" width="5" height="5" fill="#2f5bff" />
    </svg>
  );
}
