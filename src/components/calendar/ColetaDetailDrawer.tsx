import { useEffect, useState } from 'react';
import { X, Clock, Users, Target, Plus, Trash2, Pencil, Check, Upload, Download, Square, CheckSquare } from 'lucide-react';
import type { Coleta, Condutor, Agendamento, StatusAgendamento } from '@/types';
import { calcColetaStats, dbAgendamentos, dbCondutores, dbColetas } from '@/lib/db';
import { formatDateBR, formatTime, getOccupancyColor, colorClasses, toCSV, downloadFile } from '@/utils';
import { STATUS_AGENDAMENTO_LABELS, STATUS_COLETA_LABELS } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { useAuthStore } from '@/store/auth';
import { canWrite } from '@/store/auth';

interface ColetaDetailDrawerProps {
  coleta: Coleta | null;
  onClose: () => void;
  onUpdated: () => void;
}

const statusColor: Record<StatusAgendamento, string> = {
  agendado: 'bg-blue-100 text-blue-700',
  confirmado: 'bg-emerald-100 text-emerald-700',
  compareceu: 'bg-green-100 text-green-700',
  ausente: 'bg-red-100 text-red-700',
  cancelado: 'bg-slate-100 text-slate-600',
  concluido: 'bg-purple-100 text-purple-700',
};

const statusBorder: Record<StatusAgendamento, string> = {
  agendado: 'border-l-blue-400',
  confirmado: 'border-l-emerald-500',
  compareceu: 'border-l-green-500',
  ausente: 'border-l-red-500',
  cancelado: 'border-l-slate-400',
  concluido: 'border-l-purple-500',
};

export function ColetaDetailDrawer({ coleta, onClose, onUpdated }: ColetaDetailDrawerProps) {
  const user = useAuthStore((s) => s.user);
  const canEdit = canWrite(user?.perfil);

  const [condutores, setCondutores] = useState<Condutor[]>([]);
  const [selectedCondutor, setSelectedCondutor] = useState('');
  const [cancelTarget, setCancelTarget] = useState<Agendamento | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [novaMeta, setNovaMeta] = useState(0);
  const [deleteColeta, setDeleteColeta] = useState(false);

  // Importar condutores
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ agendados: number; criados: number; erros: string[] } | null>(null);

  const [filtroStatus, setFiltroStatus] = useState<StatusAgendamento | ''>('');

  // Seleção múltipla
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<StatusAgendamento>('agendado');
  const [confirmBulkRemove, setConfirmBulkRemove] = useState(false);

  useEffect(() => {
    if (coleta) {
      dbCondutores.listAtivos().then(({ data }) => setCondutores((data as Condutor[]) || []));
      setEditingMeta(false);
      setSelectedIds(new Set());
    }
  }, [coleta]);

  if (!coleta) return null;

  const { agendados, vagas, ocupacao } = calcColetaStats(coleta);
  const color = getOccupancyColor(ocupacao, coleta.status);
  const c = colorClasses[color];

  const agendamentosAtuais = coleta.agendamentos || [];
  const agendamentosAtivos = agendamentosAtuais.filter((a) => a.status !== 'cancelado');

  const agendar = async () => {
    if (!selectedCondutor || !coleta) return;
    setLoading(true);

    const agendamentoExistente = agendamentosAtuais.find((a) => a.condutor_id === selectedCondutor);
    let error: { message: string } | null = null;

    if (agendamentoExistente?.status === 'cancelado') {
      const result = await dbAgendamentos.updateStatus(agendamentoExistente.id, 'agendado');
      error = result.error;
    } else if (agendamentoExistente) {
      error = { message: 'Condutor já está agendado nesta coleta.' };
    } else {
      const result = await dbAgendamentos.create({
        coleta_id: coleta.id,
        condutor_id: selectedCondutor,
        status: 'agendado',
        created_by: user?.id,
      });
      error = result.error;
    }

    if (error) {
      alert(error.message.includes('atingida') ? 'Meta atingida! Não há vagas.' : error.message.includes('conflitante') ? 'Conflito de horário para este condutor.' : error.message);
    } else {
      setSelectedCondutor('');
      onUpdated();
    }
    setLoading(false);
  };

  const alterarStatus = async (ag: Agendamento, status: StatusAgendamento) => {
    if (status === 'cancelado') {
      await dbAgendamentos.remove(ag.id);
    } else {
      await dbAgendamentos.updateStatus(ag.id, status);
    }
    onUpdated();
  };

  const confirmarCancelamento = async () => {
    if (!cancelTarget) return;
    await dbAgendamentos.remove(cancelTarget.id);
    setCancelTarget(null);
    onUpdated();
  };

  const salvarMeta = async () => {
    if (!coleta) return;
    await dbColetas.update(coleta.id, { meta: novaMeta });
    setEditingMeta(false);
    onUpdated();
  };

  const iniciarEdicaoMeta = () => {
    setNovaMeta(coleta.meta);
    setEditingMeta(true);
  };

  const excluirColeta = async () => {
    if (!coleta) return;
    await dbColetas.remove(coleta.id);
    setDeleteColeta(false);
    onClose();
    onUpdated();
  };

  const parseImportText = (text: string): { nome: string; cpf: string; telefone: string }[] => {
    const linhas = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const resultados: { nome: string; cpf: string; telefone: string }[] = [];
    const soDigitos = (s: string) => s.replace(/\D/g, '');

    for (const linha of linhas) {
      if (/^(nome|name|cpf)/i.test(linha)) continue;
      let partes = linha.split(/\t|,|;/).map((p) => p.trim()).filter(Boolean);

      if (partes.length === 1) {
        const matchTelefone = linha.match(
          /^(.+?)\s+(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\s+((?:\d{2}\s?)?\d{4,5}-?\d{4})$/
        );
        if (matchTelefone) {
          partes = [matchTelefone[1].trim(), matchTelefone[2].trim(), matchTelefone[3].trim()];
        } else {
          const match = linha.match(/^(.+?)\s+(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{11})$/);
          if (match) partes = [match[1].trim(), match[2].trim()];
        }
      }

      let nome = '';
      let cpf = '';
      let telefone = '';

      // 3+ colunas: nome, CPF, telefone
      if (partes.length >= 3) {
        const penultimo = soDigitos(partes[partes.length - 2]);
        const ultimo = soDigitos(partes[partes.length - 1]);
        if (penultimo.length === 11 && (ultimo.length === 10 || ultimo.length === 11)) {
          cpf = penultimo;
          telefone = ultimo;
          nome = partes.slice(0, -2).join(' ').trim();
        }
      }

      // 2 colunas: nome, CPF
      if (!cpf && partes.length >= 2) {
        const ultimo = soDigitos(partes[partes.length - 1]);
        if (ultimo.length === 11) {
          cpf = ultimo;
          nome = partes.slice(0, -1).join(' ').trim();
        }
      }

      if (nome && cpf.length === 11) resultados.push({ nome, cpf, telefone });
    }
    return resultados;
  };

  const handleImport = async () => {
    if (!importText.trim() || !coleta) return;
    setImporting(true);
    setImportResult(null);

    const parsed = parseImportText(importText);
    if (parsed.length === 0) {
      setImportResult({ agendados: 0, criados: 0, erros: ['Nenhum registro válido encontrado. Use: Nome, CPF por linha.'] });
      setImporting(false);
      return;
    }

    // Busca todos os condutores para matching por CPF
    const { data: todosCondutores } = await dbCondutores.list();
    const condutoresList = (todosCondutores as Condutor[]) || [];
    const cpfMap = new Map<string, Condutor>();
    for (const cd of condutoresList) {
      if (cd.cpf) cpfMap.set(cd.cpf.replace(/\D/g, ''), cd);
    }

    let criados = 0;
    let agendados = 0;
    const erros: string[] = [];
    const agendamentoMap = new Map(agendamentosAtuais.map((a) => [a.condutor_id, a]));

    for (const item of parsed) {
      let condutor = cpfMap.get(item.cpf);
      // Cria o condutor se não existir
      if (!condutor) {
        const { data: novo } = await dbCondutores.bulkCreate([{
          nome_completo: item.nome,
          cpf: item.cpf,
          telefone: item.telefone || null,
          cidade_id: coleta.hub?.cidade_id || null,
          hub_id: coleta.hub_id,
          status: 'ativo',
        }]);
        if (novo && novo[0]) {
          condutor = novo[0] as Condutor;
          criados++;
        }
      } else if (item.telefone && !condutor.telefone) {
        // Complementa o telefone caso o condutor existente ainda não tenha
        await dbCondutores.update(condutor.id, { telefone: item.telefone });
        condutor = { ...condutor, telefone: item.telefone };
      }
      if (condutor) {
        const agendamentoExistente = agendamentoMap.get(condutor.id);
        let error: { message: string } | null = null;

        if (agendamentoExistente?.status === 'cancelado') {
          const result = await dbAgendamentos.updateStatus(agendamentoExistente.id, 'agendado');
          error = result.error;
        } else if (agendamentoExistente) {
          error = { message: 'condutor já está agendado nesta coleta' };
        } else {
          const result = await dbAgendamentos.create({
            coleta_id: coleta.id,
            condutor_id: condutor.id,
            status: 'agendado',
            created_by: user?.id,
          });
          error = result.error;
        }

        if (error) {
          erros.push(`${item.nome}: ${error.message.includes('atingida') ? 'meta atingida' : error.message.includes('conflitante') ? 'conflito de horário' : error.message}`);
        } else {
          agendamentoMap.set(condutor.id, {
            ...(agendamentoExistente || {}),
            condutor_id: condutor.id,
            status: 'agendado',
          } as Agendamento);
          agendados++;
        }
      }
    }

    setImportResult({ agendados, criados, erros });
    setImportText('');
    setImporting(false);
    onUpdated();
    // Recarrega lista de condutores
    dbCondutores.listAtivos().then(({ data }) => setCondutores((data as Condutor[]) || []));
  };

  const statusCounts: Record<StatusAgendamento, number> = {
    agendado: 0,
    confirmado: 0,
    compareceu: 0,
    ausente: 0,
    cancelado: 0,
    concluido: 0,
  };
  agendamentosAtivos.forEach((a) => { statusCounts[a.status]++; });

  const compareceram = statusCounts.compareceu + statusCounts.concluido;
  const taxaComparecimento = agendamentosAtivos.length > 0
    ? Math.round((compareceram / agendamentosAtivos.length) * 100)
    : 0;

  const agendamentosFiltrados = filtroStatus
    ? agendamentosAtivos.filter((a) => a.status === filtroStatus)
    : agendamentosAtivos;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltrados = () => {
    if (agendamentosFiltrados.length > 0 && agendamentosFiltrados.every((a) => selectedIds.has(a.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(agendamentosFiltrados.map((a) => a.id)));
    }
  };

  const aplicarStatusEmLote = async () => {
    if (selectedIds.size === 0) return;
    if (bulkStatus === 'cancelado') {
      await dbAgendamentos.bulkRemove(Array.from(selectedIds));
    } else {
      await dbAgendamentos.bulkUpdateStatus(Array.from(selectedIds), bulkStatus);
    }
    setSelectedIds(new Set());
    onUpdated();
  };

  const removerSelecionados = async () => {
    if (selectedIds.size === 0) return;
    await dbAgendamentos.bulkRemove(Array.from(selectedIds));
    setConfirmBulkRemove(false);
    setSelectedIds(new Set());
    onUpdated();
  };

  const exportarAgendamentos = () => {
    if (!coleta) return;
    const linhas = agendamentosAtivos.map((a) => ({
      'Condutor': a.condutor?.nome_completo || '',
      'CPF': a.condutor?.cpf || '',
      'Telefone': a.condutor?.telefone || '',
      'Status': STATUS_AGENDAMENTO_LABELS[a.status],
      'HUB': coleta.hub?.sigla || '',
      'Data': formatDateBR(coleta.data_coleta),
      'Horário': formatTime(coleta.horario),
    }));
    const csv = toCSV(linhas);
    downloadFile(csv, `agendamentos_${coleta.hub?.sigla}_${coleta.data_coleta}.csv`);
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[1120px] bg-white shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className={`${c.bg} ${c.border} border-b px-6 py-5`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-800">{coleta.hub?.sigla}</h2>
                {coleta.is_demo && <Badge variant="warning">DEMO</Badge>}
              </div>
              <p className="text-sm text-slate-600">{coleta.hub?.nome} • {coleta.hub?.cidade?.nome}</p>
            </div>
            <div className="flex items-center gap-1">
              {canEdit && (
                <button
                  onClick={() => setDeleteColeta(true)}
                  className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg"
                  title="Excluir coleta"
                >
                  <Trash2 size={18} />
                </button>
              )}
              <button onClick={onClose} className="p-1.5 hover:bg-white/50 rounded-lg">
                <X size={20} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-3 text-sm">
            <span className="flex items-center gap-1 text-slate-700">
              <Clock size={14} /> {formatDateBR(coleta.data_coleta)} • {formatTime(coleta.horario)}
            </span>
            <Badge variant={coleta.status === 'finalizada' ? 'gray' : 'info'}>{STATUS_COLETA_LABELS[coleta.status]}</Badge>
          </div>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-y-auto border-b border-slate-200 lg:border-b-0 lg:border-r lg:border-slate-200">
            <div className="grid grid-cols-3 gap-4 px-6 py-5 border-b border-slate-200">
              <div className="text-center">
                <div className="text-xs text-slate-500">Meta</div>
                {editingMeta ? (
                  <div className="flex items-center justify-center gap-1">
                    <input
                      type="number"
                      min={0}
                      className="w-16 text-center text-lg font-bold text-slate-800 border border-slate-300 rounded px-1 py-0.5"
                      value={novaMeta}
                      onChange={(e) => setNovaMeta(Number(e.target.value))}
                      autoFocus
                    />
                    <button className="p-1 text-green-600 hover:bg-green-50 rounded" onClick={salvarMeta} title="Salvar">
                      <Check size={16} />
                    </button>
                    <button className="p-1 text-slate-400 hover:bg-slate-100 rounded" onClick={() => setEditingMeta(false)} title="Cancelar">
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="text-lg font-bold text-slate-800 flex items-center justify-center gap-1">
                    <Target size={14} className="text-brand-500" /> {coleta.meta}
                    {canEdit && (
                      <button className="p-0.5 text-slate-400 hover:text-brand-600 hover:bg-slate-100 rounded" onClick={iniciarEdicaoMeta} title="Editar meta">
                        <Pencil size={12} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-500">Agendados</div>
                <div className={`text-lg font-bold flex items-center justify-center gap-1 ${c.text}`}>
                  <Users size={14} /> {agendados}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-500">Vagas</div>
                <div className="text-lg font-bold text-slate-800">{vagas}</div>
              </div>
            </div>

            <div className="px-6 py-4 border-b border-slate-200">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-slate-600">Ocupação</span>
                <span className="font-semibold">{ocupacao}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full ${c.bar} rounded-full transition-all`} style={{ width: `${Math.min(ocupacao, 100)}%` }} />
              </div>
            </div>

            {agendamentosAtivos.length > 0 && (
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/60">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Efetividade</span>
                  <span className={`text-sm font-bold ${taxaComparecimento >= 80 ? 'text-green-600' : taxaComparecimento >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                    {taxaComparecimento}% comparecimento
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {([
                    { key: 'agendado', label: 'Agendados', color: 'text-blue-600 bg-blue-50 border-blue-200' },
                    { key: 'confirmado', label: 'Confirmados', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
                    { key: 'compareceu', label: 'Compareceram', color: 'text-green-600 bg-green-50 border-green-200' },
                    { key: 'ausente', label: 'Ausentes', color: 'text-red-600 bg-red-50 border-red-200' },
                  ] as const).map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setFiltroStatus(filtroStatus === s.key ? '' : s.key)}
                      className={`p-2.5 rounded-lg border text-center transition ${s.color} ${filtroStatus === s.key ? 'ring-2 ring-offset-1 ring-slate-400' : 'hover:opacity-80'}`}
                    >
                      <div className="text-base font-bold leading-none">{statusCounts[s.key]}</div>
                      <div className="text-[10px] mt-0.5 font-medium opacity-80">{s.label}</div>
                    </button>
                  ))}
                </div>
                {filtroStatus && (
                  <button
                    className="text-[11px] text-blue-600 hover:underline"
                    onClick={() => setFiltroStatus('')}
                  >
                    ← Ver todos ({agendamentosAtivos.length})
                  </button>
                )}
              </div>
            )}

            {canEdit && (
              <div className="px-6 py-4">
                <label className="label">Agendar condutor</label>
                <div className="flex gap-2 mb-2">
                  <select
                    className="input min-w-0"
                    value={selectedCondutor}
                    onChange={(e) => setSelectedCondutor(e.target.value)}
                  >
                    <option value="">Selecione um condutor...</option>
                    {condutores
                      .filter((cd) => !coleta.agendamentos?.some((a) => a.condutor_id === cd.id && a.status !== 'cancelado'))
                      .map((cd) => (
                        <option key={cd.id} value={cd.id}>{cd.nome_completo}</option>
                      ))}
                  </select>
                  <button className="btn-primary flex-shrink-0 min-w-[52px]" onClick={agendar} disabled={!selectedCondutor || loading}>
                    <Plus size={16} />
                  </button>
                </div>
                <button
                  className="btn-secondary w-full"
                  onClick={() => { setImportOpen(true); setImportResult(null); }}
                >
                  <Upload size={16} /> Importar e agendar em lote
                </button>
              </div>
            )}
          </div>

          <div className="min-h-0 overflow-y-auto px-6 py-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-sm font-semibold text-slate-700">
              Condutores {filtroStatus ? STATUS_AGENDAMENTO_LABELS[filtroStatus].toLowerCase() + 's' : 'agendados'} ({agendamentosFiltrados.length})
            </h3>
            <div className="flex items-center gap-1">
              {canEdit && agendamentosFiltrados.length > 0 && (
                <button
                  onClick={selectAllFiltrados}
                  title="Selecionar todos"
                  className="p-1 text-slate-400 hover:text-brand-600 hover:bg-slate-100 rounded"
                >
                  {agendamentosFiltrados.every((a) => selectedIds.has(a.id)) ? (
                    <CheckSquare size={16} className="text-brand-600" />
                  ) : (
                    <Square size={16} />
                  )}
                </button>
              )}
              <button
                onClick={exportarAgendamentos}
                title="Exportar CSV"
                className="p-1 text-slate-400 hover:text-green-600 hover:bg-slate-100 rounded"
              >
                <Download size={16} />
              </button>
            </div>
          </div>

          {/* Barra de ações em lote */}
          {canEdit && selectedIds.size > 0 && (
            <div className="sticky top-0 z-10 mb-4 p-3 rounded-xl bg-brand-50 border border-brand-200 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-brand-700 whitespace-nowrap">
                {selectedIds.size} selecionado(s)
              </span>
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value as StatusAgendamento)}
                className="text-xs border border-slate-300 rounded-lg px-2 py-2 bg-white flex-1 min-w-[180px]"
              >
                {Object.entries(STATUS_AGENDAMENTO_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <button
                onClick={aplicarStatusEmLote}
                className="btn-primary !py-1 !px-2 text-xs whitespace-nowrap"
              >
                Aplicar
              </button>
              <button
                onClick={() => setConfirmBulkRemove(true)}
                className="btn-danger !py-1 !px-2 text-xs whitespace-nowrap"
              >
                Remover
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="p-1 text-slate-400 hover:text-red-500 rounded"
                title="Limpar seleção"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {agendamentosFiltrados.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">
              {filtroStatus ? 'Nenhum condutor com este status.' : 'Nenhum condutor agendado'}
            </p>
          ) : (
            <div className="space-y-2">
              {agendamentosFiltrados.map((ag) => (
                <div
                  key={ag.id}
                  className={`flex flex-col gap-3 rounded-xl bg-slate-50 border border-slate-100 border-l-4 p-3.5 md:flex-row md:items-center md:justify-between ${statusBorder[ag.status]} ${selectedIds.has(ag.id) ? 'ring-2 ring-brand-400 bg-brand-50' : ''}`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {canEdit && (
                      <button onClick={() => toggleSelect(ag.id)} className="flex-shrink-0">
                        {selectedIds.has(ag.id) ? (
                          <CheckSquare size={16} className="text-brand-600" />
                        ) : (
                          <Square size={16} className="text-slate-300" />
                        )}
                      </button>
                    )}
                    <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {ag.condutor?.nome_completo.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm md:text-base font-medium text-slate-800 truncate">{ag.condutor?.nome_completo}</div>
                      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                        <span>{ag.condutor?.telefone || 'Sem telefone'}</span>
                        {canEdit && <span className={`badge ${statusColor[ag.status]}`}>{STATUS_AGENDAMENTO_LABELS[ag.status]}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 self-end md:self-auto">
                    {canEdit ? (
                      <select
                        value={ag.status}
                        onChange={(e) => alterarStatus(ag, e.target.value as StatusAgendamento)}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white min-w-[140px]"
                      >
                        {Object.entries(STATUS_AGENDAMENTO_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`badge ${statusColor[ag.status]}`}>{STATUS_AGENDAMENTO_LABELS[ag.status]}</span>
                    )}
                    {canEdit && (
                      <button className="p-1 text-red-500 hover:bg-red-50 rounded" onClick={() => setCancelTarget(ag)} title="Cancelar">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={confirmarCancelamento}
        title="Remover agendamento"
        message={`Deseja remover o agendamento de ${cancelTarget?.condutor?.nome_completo}? A vaga será liberada.`}
        confirmLabel="Remover agendamento"
      />

      <ConfirmDialog
        open={deleteColeta}
        onClose={() => setDeleteColeta(false)}
        onConfirm={excluirColeta}
        title="Excluir coleta"
        message={`Deseja excluir a coleta ${coleta?.hub?.sigla} de ${coleta ? formatDateBR(coleta.data_coleta) : ''} às ${coleta ? formatTime(coleta.horario) : ''}? Todos os agendamentos desta coleta também serão removidos.`}
        confirmLabel="Excluir coleta"
      />

      <ConfirmDialog
        open={confirmBulkRemove}
        onClose={() => setConfirmBulkRemove(false)}
        onConfirm={removerSelecionados}
        title="Remover agendamentos selecionados"
        message={`Deseja remover ${selectedIds.size} agendamento(s) selecionado(s)? Essa ação libera as vagas desta coleta.`}
        confirmLabel="Remover selecionados"
      />

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Importar e agendar condutores" size="md">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Cole uma lista de <strong>nome, CPF e telefone</strong> (telefone opcional), um por linha. Os condutores já cadastrados serão agendados; os novos serão criados automaticamente.
          </p>
          <textarea
            className="input h-48 font-mono text-sm"
            placeholder={'João Silva, 123.456.789-00, (11) 91234-5678\nMaria Santos 987.654.321-00 21998765432\nCarlos Souza; 111.222.333-44'}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />

          {importResult && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm space-y-1">
              {importResult.agendados > 0 && <div className="text-green-700">✓ {importResult.agendados} condutor(es) agendado(s)</div>}
              {importResult.criados > 0 && <div className="text-blue-700">+ {importResult.criados} condutor(es) criado(s)</div>}
              {importResult.erros.length > 0 && (
                <div className="text-red-600">
                  <div className="font-semibold mb-1">⚠ {importResult.erros.length} erro(s):</div>
                  <ul className="list-disc list-inside text-xs">
                    {importResult.erros.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              className="btn-primary flex-1"
              onClick={handleImport}
              disabled={!importText.trim() || importing}
            >
              {importing ? 'Processando...' : 'Importar e agendar'}
            </button>
            <button className="btn-secondary" onClick={() => setImportOpen(false)}>Fechar</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
