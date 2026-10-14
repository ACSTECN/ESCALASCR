import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Copy, RefreshCw, History } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { dbMetas, dbHubs, dbCidades, dbHistorico } from '@/lib/db';
import type { MetaColeta, Hub, Cidade, HistoricoAlteracao } from '@/types';
import { DIAS_SEMANA } from '@/types';
import { formatTime } from '@/utils';
import { useAuthStore } from '@/store/auth';
import { canManageGoals } from '@/store/auth';

export function MetasPage() {
  const user = useAuthStore((s) => s.user);
  const canEdit = canManageGoals(user?.perfil);

  const [metas, setMetas] = useState<MetaColeta[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [cidades, setCidades] = useState<Cidade[]>([]);
  const [historico, setHistorico] = useState<HistoricoAlteracao[]>([]);
  const [loading, setLoading] = useState(true);

  const [filtroCidade, setFiltroCidade] = useState<string>('');
  const [filtroHub, setFiltroHub] = useState<string>('');

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MetaColeta | null>(null);
  const [form, setForm] = useState({
    hub_id: '',
    horario: '14:00',
    meta: 20,
    ativo: true,
  });
  const [diasSelecionados, setDiasSelecionados] = useState<number[]>([1]);

  // Replicar
  const [replicarMeta, setReplicarMeta] = useState<MetaColeta | null>(null);
  const [replicarDias, setReplicarDias] = useState<number[]>([]);

  // Histórico modal
  const [historicoOpen, setHistoricoOpen] = useState(false);
  const [historicoMeta, setHistoricoMeta] = useState<MetaColeta | null>(null);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<MetaColeta | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [m, h, c] = await Promise.all([dbMetas.list(), dbHubs.list(), dbCidades.list()]);
    setMetas((m.data as MetaColeta[]) || []);
    setHubs((h.data as Hub[]) || []);
    setCidades((c.data as Cidade[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const openModal = (meta?: MetaColeta) => {
    setEditing(meta || null);
    if (meta) {
      setForm({ hub_id: meta.hub_id, horario: meta.horario, meta: meta.meta, ativo: meta.ativo });
      setDiasSelecionados([meta.dia_semana]);
    } else {
      setForm({ hub_id: hubs[0]?.id || '', horario: '14:00', meta: 20, ativo: true });
      setDiasSelecionados([1]);
    }
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.hub_id) return;
    if (editing) {
      await dbMetas.update(editing.id, { ...form, dia_semana: diasSelecionados[0] });
    } else {
      if (diasSelecionados.length === 0) {
        alert('Selecione pelo menos um dia da semana.');
        return;
      }
      // Cria uma meta para cada dia selecionado
      for (const dia of diasSelecionados) {
        await dbMetas.create({ ...form, dia_semana: dia });
      }
    }
    // Gera coletas automaticamente para a semana atual + próximas
    await dbMetas.gerarRecorrentes(form.hub_id);
    setModalOpen(false);
    loadData();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await dbMetas.remove(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    loadData();
  };

  const handleReplicar = async () => {
    if (!replicarMeta || replicarDias.length === 0) return;
    for (const dia of replicarDias) {
      if (dia === replicarMeta.dia_semana) continue;
      await dbMetas.create({
        hub_id: replicarMeta.hub_id,
        dia_semana: dia,
        horario: replicarMeta.horario,
        meta: replicarMeta.meta,
        ativo: true,
      });
    }
    // Gera coletas automaticamente após replicar
    await dbMetas.gerarRecorrentes(replicarMeta.hub_id);
    setReplicarMeta(null);
    setReplicarDias([]);
    loadData();
  };

  const gerarColetas = async () => {
    await dbMetas.gerarRecorrentes(undefined, undefined, undefined);
    alert('Coletas geradas/atualizadas para os próximos 30 dias.');
  };

  const verHistorico = async (meta: MetaColeta) => {
    setHistoricoMeta(meta);
    const { data } = await dbHistorico.listByEntidade('metas_coletas', meta.id);
    setHistorico((data as HistoricoAlteracao[]) || []);
    setHistoricoOpen(true);
  };

  const hubsFiltrados = filtroCidade ? hubs.filter((h) => h.cidade_id === filtroCidade) : hubs;
  const metasFiltradas = metas.filter(
    (m) => (!filtroCidade || m.hub?.cidade_id === filtroCidade) && (!filtroHub || m.hub_id === filtroHub)
  );

  return (
    <div>
      <PageHeader
        title="Gestão de Metas"
        description="Defina metas de condutores por HUB, dia da semana e horário"
        actions={
          canEdit && (
            <>
              <button className="btn-secondary" onClick={gerarColetas}>
                <RefreshCw size={16} /> Gerar Coletas
              </button>
              <button className="btn-primary" onClick={() => openModal()}>
                <Plus size={16} /> Nova Meta
              </button>
            </>
          )
        }
      />

      {/* Filtros */}
      <div className="card p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Cidade</label>
            <select className="input" value={filtroCidade} onChange={(e) => { setFiltroCidade(e.target.value); setFiltroHub(''); }}>
              <option value="">Todas as cidades</option>
              {cidades.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="label">HUB</label>
            <select className="input" value={filtroHub} onChange={(e) => setFiltroHub(e.target.value)}>
              <option value="">Todos os HUBs</option>
              {hubsFiltrados.map((h) => <option key={h.id} value={h.id}>{h.sigla}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button className="btn-secondary w-full" onClick={() => { setFiltroCidade(''); setFiltroHub(''); }}>
              Limpar filtros
            </button>
          </div>
        </div>
      </div>

      {/* Lista de metas */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Carregando...</div>
        ) : metasFiltradas.length === 0 ? (
          <EmptyState title="Nenhuma meta cadastrada" description="Crie uma meta de condutores para um HUB" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-5 py-3">HUB</th>
                  <th className="text-left px-5 py-3">Cidade</th>
                  <th className="text-left px-5 py-3">Dia</th>
                  <th className="text-left px-5 py-3">Horário</th>
                  <th className="text-left px-5 py-3">Meta</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-right px-5 py-3">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metasFiltradas.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-800">{m.hub?.sigla}</td>
                    <td className="px-5 py-3 text-slate-600">{m.hub?.cidade?.nome}</td>
                    <td className="px-5 py-3 text-slate-600">{DIAS_SEMANA[m.dia_semana]}</td>
                    <td className="px-5 py-3 text-slate-600">{formatTime(m.horario)}</td>
                    <td className="px-5 py-3">
                      <Badge variant="info">{m.meta} condutores</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={m.ativo ? 'success' : 'gray'}>{m.ativo ? 'Ativo' : 'Inativo'}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button className="btn-ghost p-1.5" title="Histórico" onClick={() => verHistorico(m)}>
                          <History size={16} />
                        </button>
                        {canEdit && (
                          <>
                            <button className="btn-ghost p-1.5" title="Replicar para outros dias" onClick={() => { setReplicarMeta(m); setReplicarDias([]); }}>
                              <Copy size={16} />
                            </button>
                            <button className="btn-ghost p-1.5" onClick={() => openModal(m)}>
                              <Pencil size={16} />
                            </button>
                            <button className="btn-ghost p-1.5 text-red-500" onClick={() => setDeleteTarget(m)}>
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Nova/Editar Meta */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Meta' : 'Nova Meta'}>
        <div className="space-y-4">
          <div>
            <label className="label">HUB</label>
            <select className="input" value={form.hub_id} onChange={(e) => setForm({ ...form, hub_id: e.target.value })}>
              <option value="">Selecione...</option>
              {hubs.map((h) => <option key={h.id} value={h.id}>{h.sigla} — {h.nome}</option>)}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Dias da semana</label>
              {!editing && (
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline"
                  onClick={() => setDiasSelecionados(diasSelecionados.length === 7 ? [] : [0,1,2,3,4,5,6])}
                >
                  {diasSelecionados.length === 7 ? 'Desmarcar todos' : 'Selecionar todos'}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DIAS_SEMANA.map((d, i) => (
                <label key={i} className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition ${
                  diasSelecionados.includes(i) ? 'bg-blue-50 border-blue-300' : 'hover:bg-slate-50'
                } ${editing && i !== diasSelecionados[0] ? 'opacity-50' : ''}`}>
                  <input
                    type="checkbox"
                    checked={diasSelecionados.includes(i)}
                    onChange={(e) => {
                      if (editing) {
                        // Na edição, só permite um dia
                        setDiasSelecionados([i]);
                      } else {
                        setDiasSelecionados(e.target.checked ? [...diasSelecionados, i] : diasSelecionados.filter((x) => x !== i));
                      }
                    }}
                  />
                  <span className="text-sm text-slate-700">{d}</span>
                </label>
              ))}
            </div>
            {!editing && (
              <p className="text-xs text-slate-500 mt-1">Será criada uma meta para cada dia selecionado, com o mesmo horário e meta.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Horário</label>
              <input type="time" className="input" value={form.horario} onChange={(e) => setForm({ ...form, horario: e.target.value })} />
            </div>
            <div>
              <label className="label">Meta de condutores</label>
              <input type="number" min={0} className="input" value={form.meta} onChange={(e) => setForm({ ...form, meta: Number(e.target.value) })} />
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
            <span className="text-sm text-slate-700">Ativo</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" onClick={save}>Salvar</button>
          </div>
        </div>
      </Modal>

      {/* Modal Replicar */}
      <Modal open={!!replicarMeta} onClose={() => setReplicarMeta(null)} title="Replicar meta para outros dias">
        {replicarMeta && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Replicar a meta <strong>{replicarMeta.hub?.sigla} — {formatTime(replicarMeta.horario)} — {replicarMeta.meta} condutores</strong> para:
            </p>
            <div className="grid grid-cols-2 gap-2">
              {DIAS_SEMANA.map((d, i) => (
                <label key={i} className="flex items-center gap-2 p-2 border rounded-lg hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={replicarDias.includes(i)}
                    onChange={(e) => {
                      setReplicarDias(e.target.checked ? [...replicarDias, i] : replicarDias.filter((x) => x !== i));
                    }}
                    disabled={i === replicarMeta.dia_semana}
                  />
                  <span className={`text-sm ${i === replicarMeta.dia_semana ? 'text-slate-400' : 'text-slate-700'}`}>
                    {d}{i === replicarMeta.dia_semana && ' (atual)'}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setReplicarMeta(null)}>Cancelar</button>
              <button className="btn-primary" onClick={handleReplicar} disabled={replicarDias.length === 0}>Replicar</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Histórico */}
      <Modal open={historicoOpen} onClose={() => setHistoricoOpen(false)} title="Histórico de alterações" size="lg">
        {historicoMeta && historico.length === 0 ? (
          <EmptyState title="Sem alterações registradas" />
        ) : (
          <div className="space-y-3">
            {historico.map((h) => (
              <div key={h.id} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <Badge variant={h.acao === 'create' ? 'success' : h.acao === 'delete' ? 'danger' : 'info'}>{h.acao}</Badge>
                  <span className="text-xs text-slate-500">{new Date(h.created_at).toLocaleString('pt-BR')}</span>
                </div>
                <p className="text-xs text-slate-600">Usuário: {h.usuario?.nome || 'Sistema'}</p>
                {h.depois && (
                  <pre className="mt-2 text-xs bg-slate-50 p-2 rounded overflow-x-auto">{JSON.stringify(h.depois, null, 2).slice(0, 500)}</pre>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Excluir meta"
        message={`Deseja excluir a meta ${deleteTarget?.hub?.sigla} - ${DIAS_SEMANA[deleteTarget?.dia_semana || 0]}?`}
        confirmLabel="Excluir"
        loading={deleting}
      />
    </div>
  );
}
