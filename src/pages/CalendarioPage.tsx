import { useEffect, useState, useCallback } from 'react';
import { format, addDays } from 'date-fns';
import { Home, Filter, AlertTriangle } from 'lucide-react';
import { WeeklyCalendar } from '@/components/calendar/WeeklyCalendar';
import { PageHeader } from '@/components/ui/PageHeader';
import { dbColetas, dbHubs, dbCidades, dbConfig } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import type { Coleta, Hub, Cidade, ThresholdsOcupacao } from '@/types';
import { useUIStore } from '@/store/ui';

const DEFAULT_THRESHOLDS: ThresholdsOcupacao = { vermelho: 70, amarelo: 100, verde: 100 };

export function CalendarioPage() {
  const [coletas, setColetas] = useState<Coleta[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [cidades, setCidades] = useState<Cidade[]>([]);
  const [thresholds, setThresholds] = useState<ThresholdsOcupacao>(DEFAULT_THRESHOLDS);
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay() || 7; // domingo=0 -> 7
    return addDays(now, 1 - day); // volta para segunda
  });
  const [loading, setLoading] = useState(true);

  const filtroCidadeId = useUIStore((s) => s.filtroCidadeId);
  const filtroHubId = useUIStore((s) => s.filtroHubId);
  const filtroStatus = useUIStore((s) => s.filtroStatus);
  const setFiltroCidade = useUIStore((s) => s.setFiltroCidade);
  const setFiltroHub = useUIStore((s) => s.setFiltroHub);
  const setFiltroStatus = useUIStore((s) => s.setFiltroStatus);

  const loadColetas = useCallback(async () => {
    setLoading(true);
    const start = format(weekStart, 'yyyy-MM-dd');
    const end = format(addDays(weekStart, 6), 'yyyy-MM-dd');
    const { data } = await dbColetas.listByDateRange(start, end);
    setColetas((data as Coleta[]) || []);
    setLoading(false);
  }, [weekStart]);

  const loadRefData = async () => {
    const [h, c, cfg] = await Promise.all([dbHubs.listAtivos(), dbCidades.listAtivas(), dbConfig.get('thresholds_ocupacao')]);
    setHubs((h.data as Hub[]) || []);
    setCidades((c.data as Cidade[]) || []);
    if (cfg.data?.valor) {
      setThresholds(cfg.data.valor as ThresholdsOcupacao);
    }
  };

  useEffect(() => {
    loadRefData();
  }, []);

  useEffect(() => {
    loadColetas();
  }, [loadColetas]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('coletas_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'coletas' },
        () => loadColetas()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadColetas]);

  const goToToday = () => {
    const now = new Date();
    const day = now.getDay() || 7;
    setWeekStart(addDays(now, 1 - day));
  };

  // Aplicar filtros
  const coletasFiltradas = coletas.filter((c) => {
    if (filtroCidadeId && c.hub?.cidade_id !== filtroCidadeId) return false;
    if (filtroHubId && c.hub_id !== filtroHubId) return false;
    if (filtroStatus && c.status !== filtroStatus) return false;
    return true;
  });

  // HUBs abaixo da meta
  const abaixoMeta = coletasFiltradas.filter((c) => {
    const ativos = (c.agendamentos || []).filter((a) => a.status !== 'cancelado').length;
    return ativos < c.meta && c.status !== 'finalizada' && c.status !== 'cancelada';
  });

  const hubsFiltrados = filtroCidadeId ? hubs.filter((h) => h.cidade_id === filtroCidadeId) : hubs;

  return (
    <div>
      <PageHeader
        title="Calendário de Coletas"
        description="Acompanhe a programação semanal por HUB"
        actions={
          <button className="btn-secondary" onClick={goToToday}>
            <Home size={16} /> Hoje
          </button>
        }
      />

      {/* Alertas de meta não atingida */}
      {abaixoMeta.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-3">
          <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={18} />
          <div className="text-sm text-amber-800">
            <strong>{abaixoMeta.length} coleta(s)</strong> ainda não atingiram a meta nesta semana.
            {' '}
            {abaixoMeta.slice(0, 3).map((c) => c.hub?.sigla).join(', ')}
            {abaixoMeta.length > 3 && '...'}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="card p-4 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} className="text-slate-500" />
          <span className="text-sm font-medium text-slate-700">Filtros</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Cidade</label>
            <select
              className="input"
              value={filtroCidadeId || ''}
              onChange={(e) => { setFiltroCidade(e.target.value || null); setFiltroHub(null); }}
            >
              <option value="">Todas as cidades</option>
              {cidades.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="label">HUB</label>
            <select
              className="input"
              value={filtroHubId || ''}
              onChange={(e) => setFiltroHub(e.target.value || null)}
            >
              <option value="">Todos os HUBs</option>
              {hubsFiltrados.map((h) => <option key={h.id} value={h.id}>{h.sigla}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Status da coleta</label>
            <select
              className="input"
              value={filtroStatus || ''}
              onChange={(e) => setFiltroStatus(e.target.value || null)}
            >
              <option value="">Todos</option>
              <option value="programada">Programada</option>
              <option value="em_andamento">Em andamento</option>
              <option value="finalizada">Finalizada</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              className="btn-secondary w-full"
              onClick={() => { setFiltroCidade(null); setFiltroHub(null); setFiltroStatus(null); }}
            >
              Limpar
            </button>
          </div>
        </div>
      </div>

      {/* Legenda de cores */}
      <div className="flex flex-wrap items-center gap-4 mb-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500" /> Meta atingida</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-500" /> Próximo da meta</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500" /> Abaixo da meta</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500" /> Em andamento</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-400" /> Finalizada</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full" />
        </div>
      ) : (
        <WeeklyCalendar
          coletas={coletasFiltradas}
          weekStart={weekStart}
          onWeekChange={setWeekStart}
          thresholds={thresholds}
          onColetaUpdated={loadColetas}
        />
      )}
    </div>
  );
}
