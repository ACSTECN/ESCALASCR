import type { Coleta } from '@/types';
import { calcColetaStats } from '@/lib/db';
import { formatTime, getOccupancyColor, colorClasses } from '@/utils';
import type { ThresholdsOcupacao } from '@/types';
import { STATUS_COLETA_LABELS } from '@/types';
import { Clock, Users, CheckCircle2, CheckSquare, Square } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

interface ColetaCardProps {
  coleta: Coleta;
  thresholds: ThresholdsOcupacao;
  onClick: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export function ColetaCard({ coleta, thresholds, onClick, selectable, selected, onToggleSelect }: ColetaCardProps) {
  const { agendados, vagas, ocupacao } = calcColetaStats(coleta);
  const color = getOccupancyColor(ocupacao, coleta.status, thresholds);
  const c = colorClasses[color];

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-2xl border border-white/10 bg-[linear-gradient(145deg,rgba(2,6,23,0.92),rgba(15,23,42,0.9))] shadow-[0_18px_45px_rgba(2,6,23,0.35)] hover:shadow-[0_24px_60px_rgba(2,6,23,0.42)] transition-all cursor-pointer group relative ${
        selected ? 'ring-2 ring-cyan-400/80' : ''
      }`}
    >
      {selectable && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              onToggleSelect?.();
            }
          }}
          className="absolute top-2 right-2 cursor-pointer"
        >
          {selected ? (
            <CheckSquare size={18} className="text-cyan-300" />
          ) : (
            <Square size={18} className="text-slate-500" />
          )}
        </span>
      )}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-sm text-white">{coleta.hub?.sigla}</span>
          {coleta.is_demo && <Badge variant="warning">DEMO</Badge>}
        </div>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border border-white/10 ${c.badge}`}>
          {STATUS_COLETA_LABELS[coleta.status]}
        </span>
      </div>

      <div className="flex items-center gap-1 text-xs text-slate-400 mb-2">
        <Clock size={12} />
        <span>{formatTime(coleta.horario)}</span>
      </div>

      <div className="flex items-baseline gap-1 mb-1">
        <span className={`text-lg font-bold ${c.text}`}>{agendados}</span>
        <span className="text-xs text-slate-500">/ {coleta.meta} agendados</span>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
        <span className="flex items-center gap-1">
          <Users size={12} />
          {vagas} vagas
        </span>
        <span className="font-semibold">{ocupacao}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full ${c.bar} rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(ocupacao, 100)}%` }}
        />
      </div>

      {ocupacao >= 100 && (
        <div className="flex items-center gap-1 mt-1.5 text-[11px] text-emerald-700">
          <CheckCircle2 size={12} /> Meta atingida
        </div>
      )}
    </button>
  );
}
