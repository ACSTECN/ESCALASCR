import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Trash2, CheckSquare, Square, X } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getWeekDays, isToday, getOccupancyColor, colorClasses } from '@/utils';
import type { Coleta, ThresholdsOcupacao } from '@/types';
import { ColetaCard } from './ColetaCard';
import { ColetaDetailDrawer } from './ColetaDetailDrawer';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { dbColetas } from '@/lib/db';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { canWrite, useAuthStore } from '@/store/auth';

interface WeeklyCalendarProps {
  coletas: Coleta[];
  weekStart: Date;
  onWeekChange: (date: Date) => void;
  thresholds: ThresholdsOcupacao;
  onColetaUpdated: () => void;
}

export function WeeklyCalendar({
  coletas,
  weekStart,
  onWeekChange,
  thresholds,
  onColetaUpdated,
}: WeeklyCalendarProps) {
  const [selectedColeta, setSelectedColeta] = useState<Coleta | null>(null);
  const [mobileDayIndex, setMobileDayIndex] = useState(() => {
    const today = new Date();
    const days = getWeekDays(weekStart);
    const idx = days.findIndex((d) => isSameDay(d, today));
    return idx >= 0 ? idx : 0;
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isMobile = useMediaQuery('(max-width: 768px)');
  const user = useAuthStore((s) => s.user);
  const canEdit = canWrite(user?.perfil);
  const days = useMemo(() => getWeekDays(weekStart), [weekStart]);

  const coletasByDay = useMemo(() => {
    const map: Record<string, Coleta[]> = {};
    for (const d of days) {
      const key = format(d, 'yyyy-MM-dd');
      map[key] = coletas.filter((c) => c.data_coleta === key);
    }
    return map;
  }, [coletas, days]);

  const allIds = coletas.map((c) => c.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const excluirSelecionadas = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await dbColetas.remove(id);
    }
    setDeleting(false);
    setConfirmDelete(false);
    exitSelectionMode();
    onColetaUpdated();
  };

  // Mobile: single day view
  if (isMobile) {
    const day = days[mobileDayIndex];
    const key = format(day, 'yyyy-MM-dd');
    const dayColetas = coletasByDay[key] || [];
    const today = isToday(day);

    return (
      <div>
        {/* Day navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            className="btn-ghost p-2"
            onClick={() => setMobileDayIndex((i) => Math.max(0, i - 1))}
            disabled={mobileDayIndex === 0}
          >
            <ChevronLeft size={20} />
          </button>
          <div className="text-center">
            <div className={`text-lg font-bold ${today ? 'text-brand-600' : 'text-slate-800'}`}>
              {format(day, "EEEE", { locale: ptBR })}
            </div>
            <div className="text-sm text-slate-500">{format(day, "dd/MM/yyyy")}</div>
          </div>
          <button
            className="btn-ghost p-2"
            onClick={() => setMobileDayIndex((i) => Math.min(6, i + 1))}
            disabled={mobileDayIndex === 6}
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Day dots indicator */}
        <div className="flex justify-center gap-1.5 mb-4">
          {days.map((d, i) => {
            const k = format(d, 'yyyy-MM-dd');
            const count = (coletasByDay[k] || []).length;
            return (
              <button
                key={i}
                onClick={() => setMobileDayIndex(i)}
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  i === mobileDayIndex ? 'bg-brand-600 scale-125' : count > 0 ? 'bg-slate-300' : 'bg-slate-100'
                }`}
              />
            );
          })}
        </div>

        {/* Selection toggle (mobile) */}
        {canEdit && (
          <div className="flex justify-center mb-3">
            <button
              className="btn-secondary text-xs"
              onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
            >
              {selectionMode ? <X size={14} /> : <CheckSquare size={14} />}
              {selectionMode ? 'Cancelar seleção' : 'Selecionar coletas'}
            </button>
          </div>
        )}

        {/* Coletas stacked */}
        <div className="space-y-3">
          {dayColetas.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <CalendarIcon className="mx-auto mb-2" size={32} />
              <p className="text-sm">Nenhuma coleta neste dia</p>
            </div>
          ) : (
            dayColetas.map((c) => (
              <ColetaCard
                key={c.id}
                coleta={c}
                thresholds={thresholds}
                onClick={() => setSelectedColeta(c)}
                selectable={selectionMode}
                selected={selectedIds.has(c.id)}
                onToggleSelect={() => toggleSelect(c.id)}
              />
            ))
          )}
        </div>

        {/* Mobile selection bar */}
        {selectionMode && (
          <div className="fixed bottom-4 left-4 right-4 z-40 bg-white rounded-2xl shadow-2xl border border-slate-200 px-4 py-3 flex items-center gap-3">
            <button
              className="flex items-center gap-1 text-xs font-medium text-slate-700"
              onClick={selectAll}
            >
              {allSelected ? <CheckSquare size={16} className="text-brand-600" /> : <Square size={16} />}
              {allSelected ? 'Todas' : 'Todas'}
            </button>
            <span className="text-xs text-slate-500 flex-1">
              {selectedIds.size} selecionada(s)
            </span>
            <button
              className="btn-danger flex items-center gap-1 text-xs px-3 py-1.5 disabled:opacity-50"
              onClick={() => setConfirmDelete(true)}
              disabled={selectedIds.size === 0}
            >
              <Trash2 size={14} /> Excluir
            </button>
            <button
              className="btn-secondary text-xs px-3 py-1.5"
              onClick={exitSelectionMode}
            >
              Cancelar
            </button>
          </div>
        )}

        <ColetaDetailDrawer
          coleta={selectedColeta}
          onClose={() => setSelectedColeta(null)}
          onUpdated={() => {
            onColetaUpdated();
            setSelectedColeta(null);
          }}
        />

        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={excluirSelecionadas}
          title="Excluir coletas"
          message={`Deseja excluir ${selectedIds.size} coleta(s) selecionada(s)? Todos os agendamentos também serão removidos.`}
          confirmLabel="Excluir todas"
          loading={deleting}
        />
      </div>
    );
  }

  // Desktop: 7-column grid
  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={() => onWeekChange(new Date(weekStart.getTime() - 7 * 86400000))}>
            <ChevronLeft size={18} /> Semana anterior
          </button>
          {canEdit && (
            <button
              className="btn-secondary"
              onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
            >
              {selectionMode ? <X size={16} /> : <CheckSquare size={16} />}
              {selectionMode ? 'Cancelar' : 'Selecionar'}
            </button>
          )}
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold text-slate-800">
            {format(days[0], "dd 'de' MMM", { locale: ptBR })} —{' '}
            {format(days[6], "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
          </h2>
        </div>
        <button className="btn-secondary" onClick={() => onWeekChange(new Date(weekStart.getTime() + 7 * 86400000))}>
          Próxima semana <ChevronRight size={18} />
        </button>
      </div>

      {/* Grid 7 dias */}
      <div className="grid grid-cols-7 gap-3">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const dayColetas = coletasByDay[key] || [];
          const today = isToday(day);
          const totalMeta = dayColetas.reduce((s, c) => s + c.meta, 0);
          const totalAgendados = dayColetas.reduce((s, c) => {
            const ativos = (c.agendamentos || []).filter((a) => a.status !== 'cancelado');
            return s + ativos.length;
          }, 0);
          const ocupacao = totalMeta > 0 ? Math.round((totalAgendados / totalMeta) * 100) : 0;
          const color = getOccupancyColor(ocupacao, 'programada', thresholds);
          const cc = colorClasses[color];

          return (
            <div key={key} className="flex flex-col min-h-0">
              {/* Day header */}
              <div
                className={`text-center py-2 rounded-t-xl border-b-2 ${
                  today ? 'bg-brand-600 text-white border-brand-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <div className="text-xs font-medium uppercase">{format(day, 'EEE', { locale: ptBR })}</div>
                <div className="text-lg font-bold leading-tight">{format(day, 'dd')}</div>
                {dayColetas.length > 0 && (
                  <div className={`text-[10px] ${today ? 'text-brand-100' : cc.text}`}>
                    {totalAgendados}/{totalMeta} ({ocupacao}%)
                  </div>
                )}
              </div>

              {/* Coletas */}
              <div className="flex-1 bg-white/50 border border-t-0 border-slate-200 rounded-b-xl p-2 space-y-2 min-h-[120px]">
                {dayColetas.length === 0 ? (
                  <div className="text-center text-xs text-slate-300 py-4">Sem coletas</div>
                ) : (
                  dayColetas.map((c) => (
                    <ColetaCard
                      key={c.id}
                      coleta={c}
                      thresholds={thresholds}
                      onClick={() => setSelectedColeta(c)}
                      selectable={selectionMode}
                      selected={selectedIds.has(c.id)}
                      onToggleSelect={() => toggleSelect(c.id)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating action bar when items selected */}
      {selectionMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white rounded-2xl shadow-2xl border border-slate-200 px-5 py-3 flex items-center gap-4">
          <button
            className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-brand-600"
            onClick={selectAll}
          >
            {allSelected ? <CheckSquare size={18} className="text-brand-600" /> : <Square size={18} />}
            {allSelected ? 'Desmarcar todas' : 'Selecionar todas'}
          </button>
          <span className="text-sm text-slate-500">
            {selectedIds.size} coleta(s) selecionada(s)
          </span>
          <button
            className="btn-danger flex items-center gap-1 disabled:opacity-50"
            onClick={() => setConfirmDelete(true)}
            disabled={selectedIds.size === 0}
          >
            <Trash2 size={16} /> Excluir
          </button>
        </div>
      )}

      <ColetaDetailDrawer
        coleta={selectedColeta}
        onClose={() => setSelectedColeta(null)}
        onUpdated={() => {
          onColetaUpdated();
          setSelectedColeta(null);
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={excluirSelecionadas}
        title="Excluir coletas"
        message={`Deseja excluir ${selectedIds.size} coleta(s) selecionada(s)? Todos os agendamentos também serão removidos.`}
        confirmLabel="Excluir todas"
        loading={deleting}
      />
    </div>
  );
}
