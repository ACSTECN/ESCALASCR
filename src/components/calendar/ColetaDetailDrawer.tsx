import { useEffect, useState } from 'react';
import { X, Clock, Users, Target, Plus, Trash2, Pencil, Check } from 'lucide-react';
import type { Coleta, Condutor, Agendamento, StatusAgendamento } from '@/types';
import { calcColetaStats, dbAgendamentos, dbCondutores, dbColetas } from '@/lib/db';
import { formatDateBR, formatTime, getOccupancyColor, colorClasses } from '@/utils';
import { STATUS_AGENDAMENTO_LABELS, STATUS_COLETA_LABELS } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
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

export function ColetaDetailDrawer({ coleta, onClose, onUpdated }: ColetaDetailDrawerProps) {
  const user = useAuthStore((s) => s.user);
  const canEdit = canWrite(user?.perfil);

  const [condutores, setCondutores] = useState<Condutor[]>([]);
  const [selectedCondutor, setSelectedCondutor] = useState('');
  const [cancelTarget, setCancelTarget] = useState<Agendamento | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [novaMeta, setNovaMeta] = useState(0);

  useEffect(() => {
    if (coleta) {
      dbCondutores.listAtivos().then(({ data }) => setCondutores((data as Condutor[]) || []));
      setEditingMeta(false);
    }
  }, [coleta]);

  if (!coleta) return null;

  const { agendados, vagas, ocupacao } = calcColetaStats(coleta);
  const color = getOccupancyColor(ocupacao, coleta.status);
  const c = colorClasses[color];

  const agendar = async () => {
    if (!selectedCondutor || !coleta) return;
    setLoading(true);
    const { error } = await dbAgendamentos.create({
      coleta_id: coleta.id,
      condutor_id: selectedCondutor,
      status: 'agendado',
      created_by: user?.id,
    });
    if (error) {
      alert(error.message.includes('atingida') ? 'Meta atingida! Não há vagas.' : error.message.includes('conflitante') ? 'Conflito de horário para este condutor.' : error.message);
    } else {
      setSelectedCondutor('');
      onUpdated();
    }
    setLoading(false);
  };

  const alterarStatus = async (ag: Agendamento, status: StatusAgendamento) => {
    await dbAgendamentos.updateStatus(ag.id, status);
    onUpdated();
  };

  const confirmarCancelamento = async () => {
    if (!cancelTarget) return;
    await dbAgendamentos.updateStatus(cancelTarget.id, 'cancelado');
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

  const agendamentosAtivos = (coleta.agendamentos || []).filter((a) => a.status !== 'cancelado');
  const agendamentosCancelados = (coleta.agendamentos || []).filter((a) => a.status === 'cancelado');

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className={`${c.bg} ${c.border} border-b px-5 py-4`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-800">{coleta.hub?.sigla}</h2>
                {coleta.is_demo && <Badge variant="warning">DEMO</Badge>}
              </div>
              <p className="text-sm text-slate-600">{coleta.hub?.nome} • {coleta.hub?.cidade?.nome}</p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/50 rounded-lg">
              <X size={20} />
            </button>
          </div>
          <div className="flex items-center gap-4 mt-3 text-sm">
            <span className="flex items-center gap-1 text-slate-700">
              <Clock size={14} /> {formatDateBR(coleta.data_coleta)} • {formatTime(coleta.horario)}
            </span>
            <Badge variant={coleta.status === 'finalizada' ? 'gray' : 'info'}>{STATUS_COLETA_LABELS[coleta.status]}</Badge>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3 px-5 py-4 border-b border-slate-200">
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

        {/* Progress */}
        <div className="px-5 py-3 border-b border-slate-200">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-slate-600">Ocupação</span>
            <span className="font-semibold">{ocupacao}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full ${c.bar} rounded-full transition-all`} style={{ width: `${Math.min(ocupacao, 100)}%` }} />
          </div>
        </div>

        {/* Agendar condutor */}
        {canEdit && (
          <div className="px-5 py-3 border-b border-slate-200">
            <label className="label">Agendar condutor</label>
            <div className="flex gap-2">
              <select
                className="input"
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
              <button className="btn-primary flex-shrink-0" onClick={agendar} disabled={!selectedCondutor || loading}>
                <Plus size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Lista de agendamentos */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">
            Condutores agendados ({agendamentosAtivos.length})
          </h3>
          {agendamentosAtivos.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Nenhum condutor agendado</p>
          ) : (
            <div className="space-y-2">
              {agendamentosAtivos.map((ag) => (
                <div key={ag.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {ag.condutor?.nome_completo.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{ag.condutor?.nome_completo}</div>
                      <div className="text-[11px] text-slate-500">{ag.condutor?.telefone || '—'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {canEdit ? (
                      <select
                        value={ag.status}
                        onChange={(e) => alterarStatus(ag, e.target.value as StatusAgendamento)}
                        className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white"
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

          {agendamentosCancelados.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-slate-400 mb-2">Cancelados ({agendamentosCancelados.length})</h4>
              <div className="space-y-1 opacity-60">
                {agendamentosCancelados.map((ag) => (
                  <div key={ag.id} className="flex items-center justify-between p-2 rounded bg-slate-50 line-through">
                    <span className="text-sm text-slate-600">{ag.condutor?.nome_completo}</span>
                    <span className="badge bg-slate-200 text-slate-500">Cancelado</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={confirmarCancelamento}
        title="Cancelar agendamento"
        message={`Deseja cancelar o agendamento de ${cancelTarget?.condutor?.nome_completo}? A vaga será liberada.`}
        confirmLabel="Cancelar agendamento"
      />
    </>
  );
}
