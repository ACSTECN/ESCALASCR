import { useEffect, useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { format, addDays, startOfWeek, endOfWeek } from 'date-fns';
import { Target, Users, CheckCircle2, XCircle, TrendingUp, AlertTriangle, UserCheck, UserX } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { dbColetas } from '@/lib/db';
import { calcColetaStats } from '@/lib/db';
import type { Coleta } from '@/types';
import { DIAS_SEMANA_CURTO } from '@/types';

type Periodo = 'hoje' | 'amanha' | 'semana' | 'personalizado';

export function DashboardPage() {
  const [coletas, setColetas] = useState<Coleta[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<Periodo>('semana');
  const [dataInicio, setDataInicio] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [dataFim, setDataFim] = useState(format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));

  const loadData = async () => {
    setLoading(true);
    const { data } = await dbColetas.listByDateRange(dataInicio, dataFim);
    setColetas((data as Coleta[]) || []);
    setLoading(false);
  };

  const getRange = (p: Periodo) => {
    const today = new Date();
    switch (p) {
      case 'hoje':
        return { ini: format(today, 'yyyy-MM-dd'), fim: format(today, 'yyyy-MM-dd') };
      case 'amanha':
        return { ini: format(addDays(today, 1), 'yyyy-MM-dd'), fim: format(addDays(today, 1), 'yyyy-MM-dd') };
      case 'semana':
        return {
          ini: format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
          fim: format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        };
      default:
        return { ini: dataInicio, fim: dataFim };
    }
  };

  const handlePeriodoChange = (p: Periodo) => {
    setPeriodo(p);
    if (p !== 'personalizado') {
      const r = getRange(p);
      setDataInicio(r.ini);
      setDataFim(r.fim);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataInicio, dataFim]);

  const kpis = useMemo(() => {
    let metaTotal = 0;
    let agendados = 0;
    let confirmados = 0;
    let comparecimentos = 0;
    let ausencias = 0;
    let abaixoMeta = 0;

    for (const c of coletas) {
      const stats = calcColetaStats(c);
      metaTotal += c.meta;
      agendados += stats.agendados;
      if (stats.agendados < c.meta) abaixoMeta++;
      for (const a of c.agendamentos || []) {
        if (a.status === 'confirmado') confirmados++;
        if (a.status === 'compareceu') comparecimentos++;
        if (a.status === 'ausente') ausencias++;
      }
    }

    const vagas = Math.max(metaTotal - agendados, 0);
    const preenchimento = metaTotal > 0 ? Math.round((agendados / metaTotal) * 100) : 0;

    return { metaTotal, agendados, confirmados, vagas, preenchimento, abaixoMeta, comparecimentos, ausencias };
  }, [coletas]);

  const dadosPorCidade = useMemo(() => {
    const map = new Map<string, { meta: number; agendados: number }>();
    for (const c of coletas) {
      const nome = c.hub?.cidade?.nome || 'Sem cidade';
      const stats = calcColetaStats(c);
      const cur = map.get(nome) || { meta: 0, agendados: 0 };
      cur.meta += c.meta;
      cur.agendados += stats.agendados;
      map.set(nome, cur);
    }
    return Array.from(map.entries()).map(([cidade, v]) => ({ cidade, meta: v.meta, agendados: v.agendados }));
  }, [coletas]);

  const dadosPorHub = useMemo(() => {
    const map = new Map<string, { meta: number; agendados: number }>();
    for (const c of coletas) {
      const sigla = c.hub?.sigla || '?';
      const stats = calcColetaStats(c);
      const cur = map.get(sigla) || { meta: 0, agendados: 0 };
      cur.meta += c.meta;
      cur.agendados += stats.agendados;
      map.set(sigla, cur);
    }
    return Array.from(map.entries()).map(([hub, v]) => ({ hub, meta: v.meta, agendados: v.agendados }));
  }, [coletas]);

  const dadosPorDia = useMemo(() => {
    const map = new Map<number, { meta: number; agendados: number }>();
    for (let i = 0; i < 7; i++) map.set(i, { meta: 0, agendados: 0 });
    for (const c of coletas) {
      const dow = new Date(c.data_coleta).getDay();
      const stats = calcColetaStats(c);
      const cur = map.get(dow) || { meta: 0, agendados: 0 };
      cur.meta += c.meta;
      cur.agendados += stats.agendados;
      map.set(dow, cur);
    }
    return [1, 2, 3, 4, 5, 6, 0].map((d) => ({
      dia: DIAS_SEMANA_CURTO[d],
      meta: map.get(d)?.meta || 0,
      agendados: map.get(d)?.agendados || 0,
    }));
  }, [coletas]);

  const kpiCards = [
    { label: 'Meta total', value: kpis.metaTotal, icon: Target, color: 'text-brand-600 bg-brand-50' },
    { label: 'Agendados', value: kpis.agendados, icon: Users, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Confirmados', value: kpis.confirmados, icon: CheckCircle2, color: 'text-blue-600 bg-blue-50' },
    { label: 'Vagas disponíveis', value: kpis.vagas, icon: XCircle, color: 'text-amber-600 bg-amber-50' },
    { label: '% Preenchimento', value: `${kpis.preenchimento}%`, icon: TrendingUp, color: 'text-purple-600 bg-purple-50' },
    { label: 'Abaixo da meta', value: kpis.abaixoMeta, icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
    { label: 'Comparecimentos', value: kpis.comparecimentos, icon: UserCheck, color: 'text-green-600 bg-green-50' },
    { label: 'Ausências', value: kpis.ausencias, icon: UserX, color: 'text-red-600 bg-red-50' },
  ];

  const periodos: { id: Periodo; label: string }[] = [
    { id: 'hoje', label: 'Hoje' },
    { id: 'amanha', label: 'Amanhã' },
    { id: 'semana', label: 'Semana' },
    { id: 'personalizado', label: 'Personalizado' },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard Operacional"
        description="Indicadores e gráficos de desempenho"
      />

      {/* Filtro de período */}
      <div className="card p-4 mb-6 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {periodos.map((p) => (
            <button
              key={p.id}
              onClick={() => handlePeriodoChange(p.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                periodo === p.id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {periodo === 'personalizado' && (
          <div className="flex items-center gap-2">
            <input type="date" className="input w-auto" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            <span className="text-slate-500">até</span>
            <input type="date" className="input w-auto" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {kpiCards.map((k) => (
          <div key={k.label} className="card p-4">
            <div className={`w-9 h-9 rounded-lg ${k.color} flex items-center justify-center mb-2`}>
              <k.icon size={18} />
            </div>
            <div className="text-2xl font-bold text-slate-800">{k.value}</div>
            <div className="text-xs text-slate-500">{k.label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico por cidade */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Por Cidade</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dadosPorCidade}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="cidade" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="meta" fill="#94a3b8" name="Meta" radius={[4, 4, 0, 0]} />
                <Bar dataKey="agendados" fill="#3b82f6" name="Agendados" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Gráfico por HUB */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Por HUB</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dadosPorHub}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="hub" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="meta" fill="#94a3b8" name="Meta" radius={[4, 4, 0, 0]} />
                <Bar dataKey="agendados" fill="#10b981" name="Agendados" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Gráfico por dia da semana */}
          <div className="card p-5 lg:col-span-2">
            <h3 className="font-semibold text-slate-800 mb-4">Por Dia da Semana</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dadosPorDia}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="dia" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="meta" stroke="#94a3b8" strokeWidth={2} name="Meta" dot={{ r: 4 }} />
                <Line type="monotone" dataKey="agendados" stroke="#3b82f6" strokeWidth={2} name="Agendados" dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
