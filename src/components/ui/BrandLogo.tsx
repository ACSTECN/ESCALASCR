import { CalendarDays, Clock3 } from 'lucide-react';

interface BrandLogoProps {
  compact?: boolean;
  light?: boolean;
  subtitle?: string;
  className?: string;
}

export function BrandLogo({
  compact = false,
  light = false,
  subtitle = 'Sistema de Escalas',
  className = '',
}: BrandLogoProps) {
  const titleClass = light ? 'text-white' : 'text-slate-900';
  const subtitleClass = light ? 'text-cyan-100/80' : 'text-slate-500';
  const overlineClass = light ? 'text-cyan-100/70' : 'text-slate-500';
  const chipClass = light
    ? 'border-cyan-400/30 bg-slate-950/60 shadow-[0_0_40px_rgba(34,211,238,0.22)]'
    : 'border-cyan-300/40 bg-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.15)]';

  if (compact) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <div className={`relative h-12 w-12 overflow-hidden rounded-2xl border ${chipClass}`}>
          <div className="absolute inset-[1px] rounded-[15px] bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.4),_transparent_48%),linear-gradient(135deg,_rgba(15,23,42,1),_rgba(2,6,23,0.96))]" />
          <div className="absolute inset-x-2 top-2 h-px bg-cyan-300/60" />
          <div className="absolute bottom-1.5 right-1.5 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-1 text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.35)]">
            <CalendarDays size={10} />
          </div>
          <div className="absolute inset-0 flex items-center justify-center text-lg font-black tracking-[-0.08em] text-white">
            CR
          </div>
        </div>
        <div className="min-w-0">
          <div className={`truncate text-[10px] font-medium uppercase tracking-[0.34em] ${overlineClass}`}>
            CR Logistics
          </div>
          <div className={`truncate text-base font-black tracking-[0.24em] ${titleClass}`}>
            ESCALAS
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-5 ${className}`}>
      <div className={`relative h-20 w-20 overflow-hidden rounded-[28px] border ${chipClass}`}>
        <div className="absolute inset-[1px] rounded-[27px] bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.45),_transparent_44%),linear-gradient(145deg,_rgba(15,23,42,1),_rgba(2,6,23,0.96))]" />
        <div className="absolute inset-x-4 top-4 h-px bg-cyan-300/55" />
        <div className="absolute -right-1 bottom-2 rounded-2xl border border-cyan-400/35 bg-cyan-400/10 p-2 text-cyan-200 shadow-[0_0_24px_rgba(34,211,238,0.38)]">
          <Clock3 size={14} />
        </div>
        <div className="absolute inset-0 flex items-center justify-center text-[2rem] font-black tracking-[-0.1em] text-white">
          CR
        </div>
      </div>
      <div className="min-w-0">
        <div className={`text-[11px] font-medium uppercase tracking-[0.5em] ${overlineClass}`}>
          CR Logistics
        </div>
        <div className={`text-3xl font-black tracking-[0.34em] ${titleClass}`}>
          ESCALAS
        </div>
        <div className={`mt-1 text-sm font-medium uppercase tracking-[0.34em] ${subtitleClass}`}>
          {subtitle}
        </div>
      </div>
    </div>
  );
}
