import { useEffect, useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { format, addDays, startOfWeek, endOfWeek } from 'date-fns';
import {
  Target,
  Users,
  CheckCircle2,
  XCircle,
  TrendingUp,
  AlertTriangle,
  UserCheck,
  UserX,
  Download,
  Activity,
  MapPin,
  Layers,
  CalendarDays,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { dbColetas, calcColetaStats } from '@/lib/db';
import { toCSV, downloadFile, formatDateBR, formatTime } from '@/utils';
import type { Coleta } from '@/types';
import { DIAS_SEMANA_CURTO } from '@/types';

type Periodo = 'hoje' | 'amanha' | 'semana' | 'personalizado';

type Comparativo = 'agendados' | 'confirmados' | 'compareceu' | 'ausente';

const comparativoHubConfig: Record<
  Comparativo,
  { label: string; color: string; labelColor: string }
> = {
  agendados: { label: 'Agendados', color: '#22d3ee', labelColor: '#67e8f9' },
  confirmados: { label: 'Confirmados', color: '#3b82f6', labelColor: '#93c5fd' },
  compareceu: { label: 'Compareceu', color: '#10b981', labelColor: '#6ee7b7' },
  ausente: { label: 'Ausentes', color: '#ef4444', labelColor: '#fca5a5' },
};

const STATUS_DONUT = [
  { key: 'agendado', label: 'Agendado', color: '#3b82f6' },
  { key: 'confirmado', label: 'Confirmado', color: '#22d3ee' },
  { key: 'compareceu', label: 'Compareceu', color: '#10b981' },
  { key: 'ausente', label: 'Ausente', color: '#ef4444' },
  { key: 'cancelado', label: 'Cancelado', color: '#64748b' },
] as const;

// Card de KPI com visual tecnológico: borda neon, ícone em gradiente, brilho sutil.
function KpiCard({
  icon: Icon,
  label,
  value,
  accent,
  sub,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string | number;
  accent: string;
  sub?: string;
}) {
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl p-4 shadow-[0_18px_50px_rgba(2,6,23,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(2,6,23,0.28)]"
      style={{ boxShadow: `0 0 0 1px ${accent}22, 0 18px 50px rgba(2,6,23,0.18)` }}
    >
      <div
        className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full opacity-20 blur-2xl transition-opacity duration-300 group-hover:opacity-40"
        style={{ background: accent }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            {label}
          </div>
          <div className="mt-1 text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white">
            {value}
          </div>
          {sub && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</div>}
        </div>
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-lg"
          style={{
            background: `linear-gradient(135deg, ${accent}, ${accent}99)`,
            boxShadow: `0 8px 24px ${accent}55`,
          }}
        >
          <Icon size={20} />
        </div>
      </div>
      <div
        className="mt-3 h-1 w-full rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800"
        aria-hidden
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: '60%', background: `linear-gradient(90deg, ${accent}, ${accent}55)` }}
        />
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-cyan-400/30 bg-slate-900/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      {label && <div className="mb-1 font-semibold text-cyan-300">{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-slate-200">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="capitalize">{p.name}:</span>
          <span className="font-bold tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  right,
  children,
  className = '',
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl p-5 shadow-[0_18px_50px_rgba(2,6,23,0.18)] ${className}`}>
      <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="relative mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30">
            <Icon size={16} />
          </span>
          <h3 className="text-sm font-bold tracking-wide text-slate-800 dark:text-white">
            {title}
          </h3>
        </div>
        {right}
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

export function DashboardPage() {
  const [coletas, setColetas] = useState<Coleta[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<Periodo>('semana');
  const [dataInicio, setDataInicio] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [dataFim, setDataFim] = useState(format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [comparativoHub, setComparativoHub] = useState<Comparativo>('agendados');

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
    let cancelados = 0;
    let abaixoMeta = 0;

    for (const c of coletas) {
      const stats = calcColetaStats(c);
      metaTotal += c.meta;
      agendados += stats.agendados;
      if (stats.confirmados < c.meta) abaixoMeta++;
      for (const a of c.agendamentos || []) {
        if (a.status === 'confirmado') confirmados++;
        if (a.status === 'compareceu') comparecimentos++;
        if (a.status === 'ausente') ausencias++;
        if (a.status === 'cancelado') cancelados++;
      }
    }

    const vagas = Math.max(metaTotal - agendados, 0);
    const preenchimento = metaTotal > 0 ? Math.round((confirmados / metaTotal) * 100) : 0;
    const ocupacaoAgendada = metaTotal > 0 ? Math.round((agendados / metaTotal) * 100) : 0;

    return {
      metaTotal,
      agendados,
      confirmados,
      vagas,
      preenchimento,
      ocupacaoAgendada,
      abaixoMeta,
      comparecimentos,
      ausencias,
      cancelados,
    };
  }, [coletas]);

  const exportarDashboard = () => {
    const linhas = coletas.map((c) => {
      const stats = calcColetaStats(c);
      const ags = c.agendamentos || [];
      return {
        'HUB': c.hub?.sigla || '',
        'Cidade': c.hub?.cidade?.nome || '',
        'Estado': c.hub?.cidade?.estado || '',
        'Data': formatDateBR(c.data_coleta),
        'Horário': formatTime(c.horario),
        'Meta': c.meta,
        'Agendados': stats.agendados,
        'Vagas': stats.vagas,
        'Ocupação %': stats.ocupacao,
        'Status coleta': c.status,
        'Agendado': ags.filter((a) => a.status === 'agendado').length,
        'Confirmado': ags.filter((a) => a.status === 'confirmado').length,
        'Compareceu': ags.filter((a) => a.status === 'compareceu').length,
        'Ausente': ags.filter((a) => a.status === 'ausente').length,
        'Concluído': ags.filter((a) => a.status === 'concluido').length,
      };
    });
    downloadFile(toCSV(linhas), `dashboard_${dataInicio}_a_${dataFim}.csv`);
  };

  // Distribuição de status para o donut
  const dadosStatus = useMemo(() => {
    return STATUS_DONUT.map((s) => ({
      name: s.label,
      value: coletas.reduce(
        (acc, c) => acc + (c.agendamentos || []).filter((a) => a.status === s.key).length,
        0
      ),
      color: s.color,
    })).filter((s) => s.value > 0);
  }, [coletas]);

  const totalStatus = dadosStatus.reduce((acc, s) => acc + s.value, 0);

  // Por Estado (substitui Por Cidade)
  const dadosPorEstado = useMemo(() => {
    const map = new Map<string, { meta: number; agendados: number; confirmados: number }>();
    for (const c of coletas) {
      const nome = c.hub?.cidade?.estado || 'Sem estado';
      const stats = calcColetaStats(c);
      const cur = map.get(nome) || { meta: 0, agendados: 0, confirmados: 0 };
      cur.meta += c.meta;
      cur.agendados += stats.agendados;
      cur.confirmados += stats.confirmados;
      map.set(nome, cur);
    }
    return Array.from(map.entries())
      .map(([estado, v]) => ({
        estado,
        meta: v.meta,
        agendados: v.agendados,
        confirmados: v.confirmados,
      }))
      .sort((a, b) => b.meta - a.meta);
  }, [coletas]);

  const dadosPorHub = useMemo(() => {
    const map = new Map<
      string,
      { meta: number; agendados: number; confirmados: number; compareceu: number; ausente: number }
    >();
    for (const c of coletas) {
      const sigla = c.hub?.sigla || '?';
      const stats = calcColetaStats(c);
      const cur = map.get(sigla) || { meta: 0, agendados: 0, confirmados: 0, compareceu: 0, ausente: 0 };
      cur.meta += c.meta;
      cur.agendados += stats.agendados;
      cur.confirmados += (c.agendamentos || []).filter((a) => a.status === 'confirmado').length;
      cur.compareceu += (c.agendamentos || []).filter((a) => a.status === 'compareceu').length;
      cur.ausente += (c.agendamentos || []).filter((a) => a.status === 'ausente').length;
      map.set(sigla, cur);
    }
    return Array.from(map.entries())
      .map(([hub, v]) => ({
        hub,
        meta: v.meta,
        agendados: v.agendados,
        confirmados: v.confirmados,
        compareceu: v.compareceu,
        ausente: v.ausente,
      }))
      .sort((a, b) => {
        const comparativo = b[comparativoHub] - a[comparativoHub];
        if (comparativo !== 0) return comparativo;
        return b.meta - a.meta;
      });
  }, [coletas, comparativoHub]);

  // Top HUBs por ocupação (barras de progresso)
  const topHubsOcupacao = useMemo(() => {
    const map = new Map<string, { meta: number; confirmados: number }>();
    for (const c of coletas) {
      const sigla = c.hub?.sigla || '?';
      const cur = map.get(sigla) || { meta: 0, confirmados: 0 };
      cur.meta += c.meta;
      cur.confirmados += (c.agendamentos || []).filter((a) => a.status === 'confirmado').length;
      map.set(sigla, cur);
    }
    return Array.from(map.entries())
      .map(([hub, v]) => ({
        hub,
        meta: v.meta,
        confirmados: v.confirmados,
        ocupacao: v.meta > 0 ? Math.round((v.confirmados / v.meta) * 100) : 0,
      }))
      .sort((a, b) => b.ocupacao - a.ocupacao)
      .slice(0, 6);
  }, [coletas]);

  const dadosPorDia = useMemo(() => {
    const map = new Map<number, { meta: number; agendados: number; confirmados: number }>();
    for (let i = 0; i < 7; i++) map.set(i, { meta: 0, agendados: 0, confirmados: 0 });
    for (const c of coletas) {
      const dow = new Date(c.data_coleta).getDay();
      const stats = calcColetaStats(c);
      const cur = map.get(dow) || { meta: 0, agendados: 0, confirmados: 0 };
      cur.meta += c.meta;
      cur.agendados += stats.agendados;
      cur.confirmados += stats.confirmados;
      map.set(dow, cur);
    }
    return [1, 2, 3, 4, 5, 6, 0].map((d) => ({
      dia: DIAS_SEMANA_CURTO[d],
      meta: map.get(d)?.meta || 0,
      agendados: map.get(d)?.agendados || 0,
      confirmados: map.get(d)?.confirmados || 0,
    }));
  }, [coletas]);

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
        actions={
          <button className="btn-secondary" onClick={exportarDashboard}>
            <Download size={16} /> Exportar
          </button>
        }
      />

      {/* Filtro de período - visual tech */}
      <div className="card mb-6 flex flex-wrap items-center gap-3 p-4">
        <div className="flex gap-1 rounded-xl border border-slate-200/70 dark:border-slate-700/60 bg-slate-100/70 dark:bg-slate-800/60 p-1">
          {periodos.map((p) => (
            <button
              key={p.id}
              onClick={() => handlePeriodoChange(p.id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                periodo === p.id
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
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
        <KpiCard icon={Target} label="Meta total" value={kpis.metaTotal} accent="#6366f1" sub="Vagas planejadas" />
        <KpiCard icon={Users} label="Agendados" value={kpis.agendados} accent="#22d3ee" sub={`${kpis.ocupacaoAgendada}% da meta`} />
        <KpiCard icon={CheckCircle2} label="Confirmados" value={kpis.confirmados} accent="#3b82f6" sub={`${kpis.preenchimento}% da meta`} />
        <KpiCard icon={XCircle} label="Vagas disponíveis" value={kpis.vagas} accent="#f59e0b" sub="Ainda preencher" />
        <KpiCard icon={TrendingUp} label="% Ocupação confirmada" value={`${kpis.preenchimento}%`} accent="#8b5cf6" sub="Confirmados / Meta" />
        <KpiCard icon={AlertTriangle} label="Abaixo da meta" value={kpis.abaixoMeta} accent="#ef4444" sub="Coletas não preenchidas" />
        <KpiCard icon={UserCheck} label="Comparecimentos" value={kpis.comparecimentos} accent="#10b981" sub="Presenças confirmadas" />
        <KpiCard icon={UserX} label="Ausências" value={kpis.ausencias} accent="#f43f5e" sub="Faltas registradas" />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* Linha 1: Donut de status + Top HUBs por ocupação */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <SectionCard title="Distribuição de Status" icon={Activity}>
              <div className="flex items-center gap-4">
                <div className="relative h-44 w-44 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dadosStatus}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={3}
                        stroke="none"
                      >
                        {dadosStatus.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                      {totalStatus}
                    </span>
                    <span className="text-[10px] uppercase tracking-widest text-slate-500">total</span>
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  {dadosStatus.map((s) => (
                    <div key={s.name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                        {s.name}
                      </span>
                      <span className="font-bold tabular-nums text-slate-900 dark:text-white">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Ocupação por HUB" icon={Layers} className="lg:col-span-2">
              <div className="space-y-3">
                {topHubsOcupacao.length === 0 && (
                  <div className="py-8 text-center text-sm text-slate-500">Sem dados no período.</div>
                )}
                {topHubsOcupacao.map((h) => (
                  <div key={h.hub}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{h.hub}</span>
                      <span className="tabular-nums text-slate-500 dark:text-slate-400">
                        {h.confirmados}/{h.meta} · <span className="font-bold text-cyan-400">{h.ocupacao}%</span>
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-600 transition-all duration-500"
                        style={{ width: `${Math.min(h.ocupacao, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          {/* Linha 2: Por Estado + Por HUB */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <SectionCard title="Por Estado" icon={MapPin}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dadosPorEstado} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
                  <XAxis dataKey="estado" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(34,211,238,0.06)' }} />
                  <Bar dataKey="meta" fill="#64748b" name="Meta" radius={[6, 6, 0, 0]} barSize={22}>
                    <LabelList dataKey="meta" position="top" fill="#94a3b8" fontSize={11} />
                  </Bar>
                  <Bar dataKey="confirmados" fill="url(#estadoGrad)" name="Confirmados" radius={[6, 6, 0, 0]} barSize={22}>
                    <LabelList dataKey="confirmados" position="top" fill="#22d3ee" fontSize={11} />
                  </Bar>
                  <defs>
                    <linearGradient id="estadoGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" />
                      <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>

            <SectionCard
              title="Por HUB"
              icon={Layers}
              right={
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">Comparar com:</span>
                  <select
                    className="rounded-lg border border-slate-200/70 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200"
                    value={comparativoHub}
                    onChange={(e) => setComparativoHub(e.target.value as Comparativo)}
                  >
                    <option value="agendados">Agendados</option>
                    <option value="confirmados">Confirmados</option>
                    <option value="compareceu">Compareceu</option>
                    <option value="ausente">Ausentes</option>
                  </select>
                </div>
              }
            >
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dadosPorHub} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
                  <XAxis dataKey="hub" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(34,211,238,0.06)' }} />
                  <Bar dataKey="meta" fill="#64748b" name="Meta" radius={[6, 6, 0, 0]} barSize={22}>
                    <LabelList dataKey="meta" position="top" fill="#94a3b8" fontSize={11} />
                  </Bar>
                  <Bar
                    dataKey={comparativoHub}
                    fill={comparativoHubConfig[comparativoHub].color}
                    name={comparativoHubConfig[comparativoHub].label}
                    radius={[6, 6, 0, 0]}
                    barSize={22}
                  >
                    <LabelList
                      dataKey={comparativoHub}
                      position="top"
                      fill={comparativoHubConfig[comparativoHub].labelColor}
                      fontSize={11}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>
          </div>

          {/* Linha 3: Por Dia da Semana */}
          <SectionCard title="Por Dia da Semana" icon={CalendarDays}>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={dadosPorDia} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="meta" stroke="#64748b" strokeWidth={2.5} name="Meta" dot={{ r: 4, fill: '#64748b' }} />
                <Line type="monotone" dataKey="confirmados" stroke="#22d3ee" strokeWidth={2.5} name="Confirmados" dot={{ r: 4, fill: '#22d3ee' }} />
                <Line type="monotone" dataKey="agendados" stroke="#3b82f6" strokeWidth={2.5} name="Agendados" dot={{ r: 4, fill: '#3b82f6' }} />
              </LineChart>
            </ResponsiveContainer>
          </SectionCard>
        </>
      )}
    </div>
  );
}
