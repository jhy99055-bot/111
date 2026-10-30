import type { ReactNode } from 'react';
import { Crown } from 'lucide-react';

interface SiteHeaderProps {
  actions?: ReactNode;
}

export default function SiteHeader({ actions }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
            <Crown className="h-5 w-5" aria-hidden />
          </div>
          <span className="text-sm font-bold tracking-[0.18em] text-slate-900">ROYALTY GAME</span>
        </div>
        {actions && <div className="flex items-center gap-2 sm:gap-3">{actions}</div>}
      </div>
    </header>
  );
}
