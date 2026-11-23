import { useCallback, useEffect, useState } from 'react';
import { History as HistoryIcon, Search, Download } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { dbHistorico, dbAgendamentos, dbHubs } from '@/lib/db';
import { toCSV, downloadFile, formatDateBR } from '@/utils';
import type { HistoricoAlteracao, Hub } from '@/types';
import { addDays, format } from 'date-fns';

const acaoColor: Record<string, 'success' | 'info' | 'danger'> = {
  create: 'success',
  update: 'info',
  delete: 'danger',
};

const entidadeLabels: Record<string, string> = {
  coletas: 'Coleta',
  agendamentos: 'Agendamento',
  metas_coletas: 'Meta',
  condutores: 'Condutor',
  hubs: 'HUB',
  cidades: 'Cidade',
  usuarios: 'Usuário',
};

const statusLabels: Record<string, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  compareceu: 'Compareceu',
  ausente: 'Ausente',
  cancelado: 'Cancelado',
  concluido: 'Concluído',
};

const statusColor: Record<string, 'success' | 'info' | 'danger' | 'warning' | 'gray'> = {
  agendado: 'info',
  confirmado: 'success',
  compareceu: 'success',
  ausente: 'danger',
  cancelado: 'gray',
  concluido: 'info',
};

type Aba = 'agendamentos' | 'alteracoes';

interface AgendamentoHist {
  id: string;
  status: string;
  origem: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  coleta?: {
    id: string;
    data_coleta: string;
    horario: string;
    hub?: { id: string; sigla: string; nome: string } | null;
  } | null;
  condutor?: { id: string; nome_completo: string; cpf: string | null } | null;
}

export function HistoricoPage() {
  const [aba, setAba] = useState<Aba>('agendamentos');

  // --- Auditoria (alterações) ---
  const [historico, setHistorico] = useState<HistoricoAlteracao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEntidade, setFiltroEntidade] = useState('');
  const [filtroAcao, setFiltroAcao] = useState('');

  // --- Agendamentos (quem / status / horário / origem) ---
  const [agendamentos, setAgendamentos] = useState<AgendamentoHist[]>([]);
  const [loadingAg, setLoadingAg] = useState(true);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [filtroHub, setFiltroHub] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroOrigem, setFiltroOrigem] = useState('');
  const [dataInicio, setDataInicio] = useState(() => format(addDays(new Date(), -7), 'yyyy-MM-dd'));
  const [dataFim, setDataFim] = useState(() => format(addDays(new Date(), 30), 'yyyy-MM-dd'));

  const loadHistorico = async () => {
    setLoading(true);
    const { data } = await dbHistorico.list(200);
    setHistorico((data as HistoricoAlteracao[]) || []);
    setLoading(false);
  };

  const loadAgendamentos = useCallback(async () => {
    setLoadingAg(true);
    const { data } = await dbAgendamentos.listHistorico(dataInicio, dataFim);
    setAgendamentos((data as unknown as AgendamentoHist[]) || []);
    setLoadingAg(false);
  }, [dataInicio, dataFim]);

  useEffect(() => {
    if (aba === 'alteracoes') loadHistorico();
  }, [aba]);

  useEffect(() => {
    if (aba === 'agendamentos') loadAgendamentos();
  }, [aba, loadAgendamentos]);

  useEffect(() => {
    dbHubs.listAtivos().then(({ data }) => setHubs((data as Hub[]) || []));
  }, []);

  const filtrado = historico.filter(
    (h) => (!filtroEntidade || h.entidade === filtroEntidade) && (!filtroAcao || h.acao === filtroAcao)
  );

  const agendamentosFiltrados = agendamentos.filter((a) => {
    if (filtroHub && a.coleta?.hub?.id !== filtroHub) return false;
    if (filtroStatus && a.status !== filtroStatus) return false;
    if (filtroOrigem && (a.origem || 'agente') !== filtroOrigem) return false;
    return true;
  });

  const exportarAgendamentos = () => {
    const linhas = agendamentosFiltrados.map((a, i) => ({
      '#': i + 1,
      'Data da coleta': formatDateBR(a.coleta?.data_coleta || ''),
      'Horário': (a.coleta?.horario || '').slice(0, 5),
      'HUB': a.coleta?.hub?.sigla || '',
      'Condutor': a.condutor?.nome_completo || '',
      'CPF': a.condutor?.cpf || '',
      'Status': statusLabels[a.status] || a.status,
      'Origem': (a.origem || 'agente') === 'sistema' ? 'Sistema' : 'Agente',
      'Agendado em': a.created_at ? new Date(a.created_at).toLocaleString('pt-BR') : '',
      'Última atualização': a.updated_at ? new Date(a.updated_at).toLocaleString('pt-BR') : '',
    }));
    downloadFile(toCSV(linhas), `agendamentos_${dataInicio}_a_${dataFim}.csv`);
  };

  const exportarHistorico = () => {
    const linhas = filtrado.map((h) => ({
      'Data': formatDateBR(h.created_at),
      'Entidade': entidadeLabels[h.entidade] || h.entidade,
      'Ação': h.acao,
      'Descrição': h.depois ? JSON.stringify(h.depois).slice(0, 200) : (h.antes ? JSON.stringify(h.antes).slice(0, 200) : ''),
      'Usuário': h.usuario?.nome || h.usuario_id || '',
    }));
    downloadFile(toCSV(linhas), `historico_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div>
      <PageHeader
        title="Histórico"
        description="Agendamentos (quem, status, horário e origem) e auditoria das ações"
        actions={
          <>
            <button className="btn-secondary" onClick={aba === 'agendamentos' ? exportarAgendamentos : exportarHistorico}>
              <Download size={16} /> Exportar
            </button>
            <button className="btn-secondary" onClick={aba === 'agendamentos' ? loadAgendamentos : loadHistorico}>
              <HistoryIcon size={16} /> Atualizar
            </button>
          </>
        }
      />

      {/* Abas */}
      <div className="mb-5 inline-flex rounded-xl border border-slate-200 bg-white p-1">
        <button
          className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
            aba === 'agendamentos' ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
          onClick={() => setAba('agendamentos')}
        >
          Agendamentos
        </button>
        <button
          className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
            aba === 'alteracoes' ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
          onClick={() => setAba('alteracoes')}
        >
          Alterações
        </button>
      </div>

      {aba === 'agendamentos' ? (
        <>
          <div className="card p-4 mb-5">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <label className="label">De (coleta)</label>
                <input type="date" className="input" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
              </div>
              <div>
                <label className="label">Até (coleta)</label>
                <input type="date" className="input" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
              </div>
              <div>
                <label className="label">HUB</label>
                <select className="input" value={filtroHub} onChange={(e) => setFiltroHub(e.target.value)}>
                  <option value="">Todos</option>
                  {hubs.map((h) => (
                    <option key={h.id} value={h.id}>{h.sigla} · {h.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
                  <option value="">Todos</option>
                  {Object.entries(statusLabels).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Origem</label>
                <select className="input" value={filtroOrigem} onChange={(e) => setFiltroOrigem(e.target.value)}>
                  <option value="">Todas</option>
                  <option value="agente">Agente (operação)</option>
                  <option value="sistema">Sistema (auto-agendamento)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            {loadingAg ? (
              <div className="p-8 text-center text-slate-400">Carregando...</div>
            ) : agendamentosFiltrados.length === 0 ? (
              <EmptyState icon={<Search size={32} />} title="Nenhum agendamento" description="Nenhum registro no período selecionado" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                    <tr>
                      <th className="text-left px-5 py-3">#</th>
                      <th className="text-left px-5 py-3">Data / Horário</th>
                      <th className="text-left px-5 py-3">HUB</th>
                      <th className="text-left px-5 py-3">Condutor</th>
                      <th className="text-left px-5 py-3">Status</th>
                      <th className="text-left px-5 py-3">Origem</th>
                      <th className="text-left px-5 py-3">Agendado em</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {agendamentosFiltrados.map((a, i) => (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 text-slate-400">{i + 1}</td>
                        <td className="px-5 py-3 text-slate-600 whitespace-nowrap">
                          {formatDateBR(a.coleta?.data_coleta || '')} · {(a.coleta?.horario || '').slice(0, 5)}
                        </td>
                        <td className="px-5 py-3 text-slate-700">{a.coleta?.hub?.sigla || '—'}</td>
                        <td className="px-5 py-3 text-slate-800">{a.condutor?.nome_completo || '—'}</td>
                        <td className="px-5 py-3">
                          <Badge variant={statusColor[a.status] || 'gray'}>{statusLabels[a.status] || a.status}</Badge>
                        </td>
                        <td className="px-5 py-3">
                          {(a.origem || 'agente') === 'sistema' ? (
                            <Badge variant="info">Sistema</Badge>
                          ) : (
                            <Badge variant="gray">Agente</Badge>
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate-500 whitespace-nowrap">
                          {a.created_at ? new Date(a.created_at).toLocaleString('pt-BR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="card p-4 mb-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="label">Entidade</label>
                <select className="input" value={filtroEntidade} onChange={(e) => setFiltroEntidade(e.target.value)}>
                  <option value="">Todas</option>
                  {Object.entries(entidadeLabels).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Ação</label>
                <select className="input" value={filtroAcao} onChange={(e) => setFiltroAcao(e.target.value)}>
                  <option value="">Todas</option>
                  <option value="create">Criação</option>
                  <option value="update">Atualização</option>
                  <option value="delete">Exclusão</option>
                </select>
              </div>
              <div className="flex items-end">
                <button className="btn-secondary w-full" onClick={() => { setFiltroEntidade(''); setFiltroAcao(''); }}>
                  Limpar
                </button>
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-slate-400">Carregando...</div>
            ) : filtrado.length === 0 ? (
              <EmptyState icon={<Search size={32} />} title="Nenhum registro" description="Nenhuma alteração encontrada" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                    <tr>
                      <th className="text-left px-5 py-3">Data/Hora</th>
                      <th className="text-left px-5 py-3">Entidade</th>
                      <th className="text-left px-5 py-3">Ação</th>
                      <th className="text-left px-5 py-3">Usuário</th>
                      <th className="text-left px-5 py-3">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtrado.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 text-slate-600 whitespace-nowrap">
                          {new Date(h.created_at).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-5 py-3">
                          <Badge variant="gray">{entidadeLabels[h.entidade] || h.entidade}</Badge>
                        </td>
                        <td className="px-5 py-3">
                          <Badge variant={acaoColor[h.acao] || 'gray'}>{h.acao}</Badge>
                        </td>
                        <td className="px-5 py-3 text-slate-700">{h.usuario?.nome || 'Sistema'}</td>
                        <td className="px-5 py-3">
                          <details className="text-xs text-slate-500">
                            <summary className="cursor-pointer text-brand-600 hover:underline">Ver detalhes</summary>
                            {h.depois && (
                              <pre className="mt-2 bg-slate-50 p-2 rounded overflow-x-auto max-w-md">
                                {JSON.stringify(h.depois, null, 2).slice(0, 800)}
                              </pre>
                            )}
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
