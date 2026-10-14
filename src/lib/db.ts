import { supabase } from '@/lib/supabase';
import type {
  Cidade,
  Hub,
  Condutor,
  Coleta,
  MetaColeta,
  Agendamento,
  Usuario,
  StatusAgendamento,
} from '@/types';

// ============================================================
// CIDADES
// ============================================================
export const dbCidades = {
  list: () => supabase.from('cidades').select('*').order('nome'),
  listAtivas: () => supabase.from('cidades').select('*').eq('ativo', true).order('nome'),
  create: (data: Partial<Cidade>) => supabase.from('cidades').insert(data).select().single(),
  update: (id: string, data: Partial<Cidade>) =>
    supabase.from('cidades').update(data).eq('id', id).select().single(),
  remove: (id: string) => supabase.from('cidades').delete().eq('id', id),
};

// ============================================================
// HUBS
// ============================================================
export const dbHubs = {
  list: () =>
    supabase
      .from('hubs')
      .select('*, cidade:cidades(*)')
      .order('sigla'),
  listAtivos: () =>
    supabase
      .from('hubs')
      .select('*, cidade:cidades(*)')
      .eq('ativo', true)
      .order('sigla'),
  listByCidade: (cidadeId: string) =>
    supabase
      .from('hubs')
      .select('*, cidade:cidades(*)')
      .eq('cidade_id', cidadeId)
      .order('sigla'),
  create: (data: Partial<Hub>) => supabase.from('hubs').insert(data).select().single(),
  update: (id: string, data: Partial<Hub>) =>
    supabase.from('hubs').update(data).eq('id', id).select().single(),
  remove: (id: string) => supabase.from('hubs').delete().eq('id', id),
};

// ============================================================
// CONDUTORES
// ============================================================
export const dbCondutores = {
  list: (search?: string) => {
    let q = supabase
      .from('condutores')
      .select('*, cidade:cidades(*), hub:hubs(*)')
      .order('nome_completo');
    if (search) {
      q = q.or(`nome_completo.ilike.%${search}%, telefone.ilike.%${search}%`);
    }
    return q;
  },
  listAtivos: () =>
    supabase
      .from('condutores')
      .select('*, cidade:cidades(*), hub:hubs(*)')
      .eq('status', 'ativo')
      .order('nome_completo'),
  create: (data: Partial<Condutor>) =>
    supabase.from('condutores').insert(data).select().single(),
  update: (id: string, data: Partial<Condutor>) =>
    supabase.from('condutores').update(data).eq('id', id).select().single(),
  remove: (id: string) => supabase.from('condutores').delete().eq('id', id),
};

// ============================================================
// COLETAS
// ============================================================
export const dbColetas = {
  listByDateRange: (startDate: string, endDate: string) =>
    supabase
      .from('coletas')
      .select(
        `*,
         hub:hubs(*, cidade:cidades(*)),
         agendamentos:agendamentos(*, condutor:condutores(*))`
      )
      .gte('data_coleta', startDate)
      .lte('data_coleta', endDate)
      .order('data_coleta', { ascending: true })
      .order('horario', { ascending: true }),

  listByDate: (date: string) =>
    supabase
      .from('coletas')
      .select(
        `*,
         hub:hubs(*, cidade:cidades(*)),
         agendamentos:agendamentos(*, condutor:condutores(*))`
      )
      .eq('data_coleta', date)
      .order('horario'),

  get: (id: string) =>
    supabase
      .from('coletas')
      .select(
        `*,
         hub:hubs(*, cidade:cidades(*)),
         agendamentos:agendamentos(*, condutor:condutores(*))`
      )
      .eq('id', id)
      .single(),

  create: (data: Partial<Coleta>) =>
    supabase.from('coletas').insert(data).select().single(),

  update: (id: string, data: Partial<Coleta>) =>
    supabase.from('coletas').update(data).eq('id', id).select().single(),

  remove: (id: string) => supabase.from('coletas').delete().eq('id', id),
};

// ============================================================
// METAS COLETAS (recorrentes)
// ============================================================
export const dbMetas = {
  list: () =>
    supabase
      .from('metas_coletas')
      .select('*, hub:hubs(*, cidade:cidades(*))')
      .order('dia_semana')
      .order('horario'),
  listByHub: (hubId: string) =>
    supabase.from('metas_coletas').select('*').eq('hub_id', hubId),
  create: (data: Partial<MetaColeta>) =>
    supabase.from('metas_coletas').insert(data).select().single(),
  update: (id: string, data: Partial<MetaColeta>) =>
    supabase.from('metas_coletas').update(data).eq('id', id).select().single(),
  remove: (id: string) => supabase.from('metas_coletas').delete().eq('id', id),
  gerarRecorrentes: (hubId?: string, startDate?: string, endDate?: string) =>
    supabase.rpc('gerar_coletas_recorrentes', {
      p_hub_id: hubId || null,
      p_data_inicio: startDate || null,
      p_data_fim: endDate || null,
    }),
};

// ============================================================
// AGENDAMENTOS
// ============================================================
export const dbAgendamentos = {
  listByColeta: (coletaId: string) =>
    supabase
      .from('agendamentos')
      .select('*, condutor:condutores(*)')
      .eq('coleta_id', coletaId)
      .order('created_at'),

  listByDateRange: (startDate: string, endDate: string) =>
    supabase
      .from('agendamentos')
      .select('*, coleta:coletas(*, hub:hubs(*)), condutor:condutores(*)')
      .gte('coleta.data_coleta', startDate)
      .lte('coleta.data_coleta', endDate),

  create: (data: Partial<Agendamento>) =>
    supabase.from('agendamentos').insert(data).select().single(),

  updateStatus: (id: string, status: StatusAgendamento) =>
    supabase.from('agendamentos').update({ status }).eq('id', id).select().single(),

  remove: (id: string) => supabase.from('agendamentos').delete().eq('id', id),
};

// ============================================================
// USUÁRIOS
// ============================================================
export const dbUsuarios = {
  list: () => supabase.from('usuarios').select('*').order('nome'),
  get: (id: string) => supabase.from('usuarios').select('*').eq('id', id).single(),
  update: (id: string, data: Partial<Usuario>) =>
    supabase.from('usuarios').update(data).eq('id', id).select().single(),
};

// ============================================================
// HISTÓRICO
// ============================================================
export const dbHistorico = {
  list: (limit = 100) =>
    supabase
      .from('historico_alteracoes')
      .select('*, usuario:usuarios(nome, email)')
      .order('created_at', { ascending: false })
      .limit(limit),
  listByEntidade: (entidade: string, entidadeId: string) =>
    supabase
      .from('historico_alteracoes')
      .select('*, usuario:usuarios(nome, email)')
      .eq('entidade', entidade)
      .eq('entidade_id', entidadeId)
      .order('created_at', { ascending: false }),
};

// ============================================================
// CONFIGURAÇÕES
// ============================================================
export const dbConfig = {
  get: (chave: string) =>
    supabase.from('configuracoes').select('*').eq('chave', chave).single(),
  update: (chave: string, valor: unknown) =>
    supabase.from('configuracoes').update({ valor }).eq('chave', chave).select().single(),
  list: () => supabase.from('configuracoes').select('*'),
};

// ============================================================
// HELPERS
// ============================================================
export const calcColetaStats = (coleta: Coleta) => {
  const ativos = (coleta.agendamentos || []).filter((a) => a.status !== 'cancelado');
  const agendados = ativos.length;
  const meta = coleta.meta || 0;
  const vagas = Math.max(meta - agendados, 0);
  const ocupacao = meta > 0 ? Math.round((agendados / meta) * 100) : 0;
  return { agendados, vagas, ocupacao };
};
