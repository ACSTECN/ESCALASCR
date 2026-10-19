import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabase';
import { startOfWeek, addDays, formatISO } from 'date-fns';
import type {
  Cidade,
  Hub,
  Condutor,
  Coleta,
  MetaColeta,
  Agendamento,
  Usuario,
  InteresseEntregador,
  StatusAgendamento,
  StatusInteresse,
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
      q = q.or(`nome_completo.ilike.%${search}%, telefone.ilike.%${search}%, cpf.ilike.%${search}%, observacoes.ilike.%${search}%`);
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
  bulkCreate: (data: Partial<Condutor>[]) =>
    supabase.from('condutores').insert(data).select(),
  findByCpf: async (cpf: string) => {
    const { data, error } = await supabase
      .from('condutores')
      .select('*')
      .eq('cpf', cpf)
      .limit(1);
    return { data: data && data.length > 0 ? (data[0] as Condutor) : null, error };
  },
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

  // Remove coletas que correspondem a uma meta (mesmo hub, dia da semana e horário)
  removeByMetaCriteria: async (hubId: string, diaSemana: number, horario: string) => {
    // Busca as coletas do hub e horário que caem no dia da semana especificado
    const { data: coletas } = await supabase
      .from('coletas')
      .select('id, data_coleta')
      .eq('hub_id', hubId)
      .eq('horario', horario);

    if (!coletas || coletas.length === 0) return { error: null };

    const idsParaRemover = coletas
      .filter((c) => {
        const dow = new Date(c.data_coleta).getDay();
        return dow === diaSemana;
      })
      .map((c) => c.id);

    if (idsParaRemover.length === 0) return { error: null };

    return supabase.from('coletas').delete().in('id', idsParaRemover);
  },

  removeByMetaCriteriaInRange: async (
    hubId: string,
    diaSemana: number,
    horario: string,
    startDate: string,
    endDate: string
  ) => {
    const { data: coletas } = await supabase
      .from('coletas')
      .select('id, data_coleta')
      .eq('hub_id', hubId)
      .eq('horario', horario)
      .gte('data_coleta', startDate)
      .lte('data_coleta', endDate);

    if (!coletas || coletas.length === 0) return { error: null };

    const idsParaRemover = coletas
      .filter((c) => {
        const dow = new Date(c.data_coleta).getDay();
        return dow === diaSemana;
      })
      .map((c) => c.id);

    if (idsParaRemover.length === 0) return { error: null };

    return supabase.from('coletas').delete().in('id', idsParaRemover);
  },

  removeEmptyByMetaCriteriaInRange: async (
    hubId: string,
    diaSemana: number,
    horario: string,
    startDate: string,
    endDate: string
  ) => {
    const { data: coletas } = await supabase
      .from('coletas')
      .select('id, data_coleta, agendamentos:agendamentos(id)')
      .eq('hub_id', hubId)
      .eq('horario', horario)
      .gte('data_coleta', startDate)
      .lte('data_coleta', endDate);

    if (!coletas || coletas.length === 0) return { error: null };

    const idsParaRemover = coletas
      .filter((c) => {
        const dow = new Date(c.data_coleta).getDay();
        const semAgendamentos = !c.agendamentos || c.agendamentos.length === 0;
        return dow === diaSemana && semAgendamentos;
      })
      .map((c) => c.id);

    if (idsParaRemover.length === 0) return { error: null };

    return supabase.from('coletas').delete().in('id', idsParaRemover);
  },
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
  gerarRecorrentes: (hubId?: string, startDate?: string, endDate?: string) => {
    const inicio = startDate || formatISO(startOfWeek(new Date(), { weekStartsOn: 1 }), { representation: 'date' });
    const fim = endDate || formatISO(addDays(new Date(), 30), { representation: 'date' });
    return supabase.rpc('gerar_coletas_recorrentes', {
      p_hub_id: hubId || null,
      p_data_inicio: inicio,
      p_data_fim: fim,
    });
  },
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

  bulkUpdateStatus: (ids: string[], status: StatusAgendamento) =>
    supabase.from('agendamentos').update({ status }).in('id', ids),

  bulkRemove: (ids: string[]) =>
    supabase.from('agendamentos').delete().in('id', ids),

  remove: (id: string) => supabase.from('agendamentos').delete().eq('id', id),
};

// ============================================================
// INTERESSES DE ENTREGADOR (lista de espera)
// ============================================================
export const dbInteresses = {
  list: () =>
    supabase
      .from('interesses_entregador')
      .select('*, hub:hubs(*, cidade:cidades(*))')
      .order('data_interesse', { ascending: true })
      .order('created_at', { ascending: false }),

  // Insert sem representação: o link público (anon) não tem permissão de SELECT
  create: (data: Partial<InteresseEntregador>) =>
    supabase.from('interesses_entregador').insert(data),

  updateStatus: (id: string, status: StatusInteresse, observacao?: string | null) =>
    supabase
      .from('interesses_entregador')
      .update(observacao === undefined ? { status } : { status, observacao })
      .eq('id', id)
      .select()
      .single(),

  remove: (id: string) => supabase.from('interesses_entregador').delete().eq('id', id),
};

// ============================================================
// USUÁRIOS
// ============================================================
export const dbUsuarios = {
  list: () => supabase.from('usuarios').select('*').order('nome'),
  get: (id: string) => supabase.from('usuarios').select('*').eq('id', id).single(),
  update: (id: string, data: Partial<Usuario>) =>
    supabase.from('usuarios').update(data).eq('id', id).select().single(),

  // Cria usuário via Edge Function (precisa de service_role)
  create: async (data: { email: string; password: string; nome: string; perfil: string }) => {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    const res = await fetch(`${supabaseUrl}/functions/v1/create-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) return { data: null, error: new Error(json.error || 'Erro ao criar usuário') };
    return { data: json.user, error: null };
  },

  // Remove usuário via Edge Function
  remove: async (id: string) => {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    const res = await fetch(`${supabaseUrl}/functions/v1/delete-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (!res.ok) return { data: null, error: new Error(json.error || 'Erro ao excluir usuário') };
    return { data: json, error: null };
  },
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
