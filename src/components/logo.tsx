export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <span className={`grid place-items-center rounded-[10px] bg-primary text-primary-foreground shadow-sm ${className}`}>
      <svg viewBox="0 0 24 24" className="size-[60%]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 19.5V5a2 2 0 0 1 2-2h12v15H6a2 2 0 0 0-2 2Z" />
        <path d="M14 3v7l-2-1.5L10 10V3" />
      </svg>
    </span>
  );
}
