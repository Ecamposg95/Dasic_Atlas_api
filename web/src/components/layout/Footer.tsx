import { branding } from '@/lib/branding';

export function Footer() {
  return (
    <footer className="h-9 shrink-0 border-t border-border px-6 flex items-center justify-between text-[10px] text-muted-foreground bg-card/50 backdrop-blur-sm">
      <span>
        Powered by <strong className="text-foreground">{branding.poweredBy}</strong>
      </span>
      <span className="font-mono hidden sm:flex items-center gap-2">
        <span>{branding.organizationName}</span>
        <span className="h-1 w-1 rounded-full bg-accent-glow/70" aria-hidden="true" />
        <span>
          {branding.productName} {branding.productVersion}
        </span>
      </span>
    </footer>
  );
}
