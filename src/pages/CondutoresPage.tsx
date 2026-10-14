import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Search, Phone } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { dbCondutores, dbCidades, dbHubs } from '@/lib/db';
import type { Condutor, Cidade, Hub } from '@/types';
import { useAuthStore } from '@/store/auth';
import { canWrite } from '@/store/auth';

export function CondutoresPage() {
  const user = useAuthStore((s) => s.user);
  const canEdit = canWrite(user?.perfil);

  const [condutores, setCondutores] = useState<Condutor[]>([]);
  const [cidades, setCidades] = useState<Cidade[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Condutor | null>(null);
  const [form, setForm] = useState({
    nome_completo: '',
    telefone: '',
    cidade_id: '',
    hub_id: '',
    status: 'ativo',
    observacoes: '',
  });

  const [deleteTarget, setDeleteTarget] = useState<Condutor | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [c, cid, h] = await Promise.all([
      dbCondutores.list(search),
      dbCidades.listAtivas(),
      dbHubs.listAtivos(),
    ]);
    setCondutores((c.data as Condutor[]) || []);
    setCidades((cid.data as Cidade[]) || []);
    setHubs((h.data as Hub[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [search]);

  const openModal = (cd?: Condutor) => {
    setEditing(cd || null);
    setForm(
      cd
        ? {
            nome_completo: cd.nome_completo,
            telefone: cd.telefone || '',
            cidade_id: cd.cidade_id || '',
            hub_id: cd.hub_id || '',
            status: cd.status,
            observacoes: cd.observacoes || '',
          }
        : { nome_completo: '', telefone: '', cidade_id: '', hub_id: '', status: 'ativo', observacoes: '' }
    );
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.nome_completo.trim()) return;
    if (editing) {
      await dbCondutores.update(editing.id, form);
    } else {
      await dbCondutores.create(form);
    }
    setModalOpen(false);
    loadData();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await dbCondutores.remove(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    loadData();
  };

  const hubsByCidade = form.cidade_id ? hubs.filter((h) => h.cidade_id === form.cidade_id) : hubs;

  return (
    <div>
      <PageHeader
        title="Condutores"
        description="Cadastro e gestão de condutores"
        actions={
          canEdit && (
            <button className="btn-primary" onClick={() => openModal()}>
              <Plus size={16} /> Novo Condutor
            </button>
          )
        }
      />

      {/* Busca */}
      <div className="card p-4 mb-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            className="input pl-10"
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Lista */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Carregando...</div>
        ) : condutores.length === 0 ? (
          <EmptyState title="Nenhum condutor" description="Cadastre o primeiro condutor" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-5 py-3">Condutor</th>
                  <th className="text-left px-5 py-3">Telefone</th>
                  <th className="text-left px-5 py-3">Cidade</th>
                  <th className="text-left px-5 py-3">HUB</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-right px-5 py-3">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {condutores.map((cd) => (
                  <tr key={cd.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold text-sm">
                          {cd.nome_completo.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-slate-800 flex items-center gap-2">
                            {cd.nome_completo}
                            {cd.is_demo && <Badge variant="warning">DEMO</Badge>}
                          </div>
                          {cd.observacoes && <div className="text-xs text-slate-500">{cd.observacoes}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600 flex items-center gap-1">
                      <Phone size={13} /> {cd.telefone || '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{cd.cidade?.nome || '—'}</td>
                    <td className="px-5 py-3 text-slate-600">{cd.hub?.sigla || '—'}</td>
                    <td className="px-5 py-3">
                      <Badge variant={cd.status === 'ativo' ? 'success' : 'gray'}>{cd.status}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <>
                            <button className="btn-ghost p-1.5" onClick={() => openModal(cd)}>
                              <Pencil size={16} />
                            </button>
                            <button className="btn-ghost p-1.5 text-red-500" onClick={() => setDeleteTarget(cd)}>
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

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Condutor' : 'Novo Condutor'}>
        <div className="space-y-4">
          <div>
            <label className="label">Nome completo</label>
            <input
              className="input"
              value={form.nome_completo}
              onChange={(e) => setForm({ ...form, nome_completo: e.target.value })}
              placeholder="Nome do condutor"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Telefone</label>
              <input
                className="input"
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                placeholder="(11) 99999-9999"
              />
            </div>
            <div>
              <label className="label">Status</label>
              <select
                className="input"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Cidade</label>
              <select
                className="input"
                value={form.cidade_id}
                onChange={(e) => setForm({ ...form, cidade_id: e.target.value, hub_id: '' })}
              >
                <option value="">Selecione...</option>
                {cidades.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">HUB principal</label>
              <select
                className="input"
                value={form.hub_id}
                onChange={(e) => setForm({ ...form, hub_id: e.target.value })}
              >
                <option value="">Selecione...</option>
                {hubsByCidade.map((h) => (
                  <option key={h.id} value={h.id}>{h.sigla}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Observações</label>
            <textarea
              className="input"
              rows={2}
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              placeholder="Observações..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" onClick={save}>Salvar</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Excluir condutor"
        message={`Deseja excluir ${deleteTarget?.nome_completo}?`}
        confirmLabel="Excluir"
        loading={deleting}
      />
    </div>
  );
}
