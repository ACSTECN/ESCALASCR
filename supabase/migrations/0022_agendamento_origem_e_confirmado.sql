-- ============================================================
-- 0022_agendamento_origem_e_confirmado.sql
-- 1) Coluna agendamentos.origem: 'agente' (operacao) ou 'sistema'
--    (auto-agendamento pelo link publico do entregador).
-- 2) Auto-agendamento SEMPRE resulta em status 'confirmado',
--    mesmo que o entregador ja esteja na escala (ausente/agendado).
-- 3) Agenda publica expoe o status atual do agendamento, para o
--    entregador poder confirmar a presenca quando ainda nao estiver
--    confirmado.
--
-- Aditivo: nao altera dados existentes (origem default 'agente').
-- ============================================================

-- ------------------------------------------------------------
-- 1) Origem do agendamento
-- ------------------------------------------------------------
alter table public.agendamentos
  add column if not exists origem text not null default 'agente';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'agendamentos_origem_check'
  ) then
    alter table public.agendamentos
      add constraint agendamentos_origem_check check (origem in ('agente', 'sistema'));
  end if;
end $$;

comment on column public.agendamentos.origem is
'Quem gerou o agendamento: agente (operacao) ou sistema (auto-agendamento do entregador)';

-- ------------------------------------------------------------
-- 2) Agenda publica: inclui o status atual do agendamento
-- ------------------------------------------------------------
create or replace function public.entregador_agenda(
  p_nome text,
  p_cpf text,
  p_telefone text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cpf text := public.only_digits(p_cpf);
  v_cond public.condutores;
  v_slots jsonb;
begin
  if v_cpf is null or length(v_cpf) < 11 then
    return jsonb_build_object('encontrado', false, 'motivo', 'cpf_invalido');
  end if;

  select * into v_cond
  from public.condutores
  where public.only_digits(cpf) = v_cpf
  limit 1;

  if v_cond.id is null then
    return jsonb_build_object('encontrado', false, 'motivo', 'nao_cadastrado');
  end if;

  select coalesce(jsonb_agg(s order by s->>'data_coleta', s->>'horario'), '[]'::jsonb)
  into v_slots
  from (
    select jsonb_build_object(
      'coleta_id', c.id,
      'data_coleta', c.data_coleta,
      'horario', to_char(c.horario, 'HH24:MI'),
      'horario_label', to_char(c.horario, 'HH24:MI'),
      'hub_id', c.hub_id,
      'hub_sigla', h.sigla,
      'hub_nome', h.nome,
      'cidade_nome', ci.nome,
      'encerrado', public.coleta_encerrada(c.id),
      'disponivel', ((not c.travar_vagas) or public.count_vagas_disponiveis(c.id) > 0)
                    and not public.coleta_encerrada(c.id),
      'agendado', exists (
        select 1 from public.agendamentos a
        where a.coleta_id = c.id
          and a.condutor_id = v_cond.id
          and a.status <> 'cancelado'
      ),
      'status_agendamento', (
        select a.status::text from public.agendamentos a
        where a.coleta_id = c.id
          and a.condutor_id = v_cond.id
          and a.status <> 'cancelado'
        limit 1
      ),
      'agendamento_id', (
        select a.id from public.agendamentos a
        where a.coleta_id = c.id
          and a.condutor_id = v_cond.id
          and a.status <> 'cancelado'
        limit 1
      )
    ) as s
    from public.coletas c
    join public.hubs h on h.id = c.hub_id
    left join public.cidades ci on ci.id = h.cidade_id
    where c.liberado = true
      and c.data_coleta >= current_date
      and c.status <> 'cancelada'
      and (
        exists (
          select 1
          from public.coleta_grupos cg
          join public.grupo_condutores gc on gc.grupo_id = cg.grupo_id
          join public.grupos g on g.id = cg.grupo_id
          where cg.coleta_id = c.id
            and gc.condutor_id = v_cond.id
            and g.ativo = true
        )
        or exists (
          select 1
          from public.coleta_condutores cc
          where cc.coleta_id = c.id
            and cc.condutor_id = v_cond.id
        )
      )
  ) t;

  return jsonb_build_object(
    'encontrado', true,
    'condutor', jsonb_build_object(
      'id', v_cond.id,
      'nome', v_cond.nome_completo,
      'cpf', v_cond.cpf,
      'telefone', v_cond.telefone,
      'hub_id', v_cond.hub_id
    ),
    'slots', v_slots
  );
end;
$$;

-- ------------------------------------------------------------
-- 3) Autoagendamento: garante 'confirmado' (inclusive quando o
--    entregador ja esta na escala com outro status).
-- ------------------------------------------------------------
create or replace function public.entregador_agendar(
  p_cpf text,
  p_coleta_id uuid,
  p_com_integracao boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cpf text := public.only_digits(p_cpf);
  v_cond public.condutores;
  v_coleta public.coletas;
  v_elegivel boolean;
  v_ag public.agendamentos;
  v_id uuid;
begin
  select * into v_cond
  from public.condutores
  where public.only_digits(cpf) = v_cpf
  limit 1;

  if v_cond.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'nao_cadastrado');
  end if;

  -- Serializa as tentativas na mesma coleta.
  select * into v_coleta from public.coletas where id = p_coleta_id for update;

  if v_coleta.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'coleta_invalida');
  end if;

  if v_coleta.status = 'cancelada' then
    return jsonb_build_object('ok', false, 'motivo', 'coleta_indisponivel');
  end if;

  if v_coleta.liberado = false then
    return jsonb_build_object('ok', false, 'motivo', 'nao_elegivel');
  end if;

  if public.coleta_encerrada(p_coleta_id) then
    return jsonb_build_object('ok', false, 'motivo', 'prazo_encerrado');
  end if;

  select (
    exists (
      select 1
      from public.coleta_grupos cg
      join public.grupo_condutores gc on gc.grupo_id = cg.grupo_id
      join public.grupos g on g.id = cg.grupo_id
      where cg.coleta_id = p_coleta_id
        and gc.condutor_id = v_cond.id
        and g.ativo = true
    )
    or exists (
      select 1
      from public.coleta_condutores cc
      where cc.coleta_id = p_coleta_id
        and cc.condutor_id = v_cond.id
    )
  ) into v_elegivel;

  if not v_elegivel then
    return jsonb_build_object('ok', false, 'motivo', 'nao_elegivel');
  end if;

  select * into v_ag
  from public.agendamentos
  where coleta_id = p_coleta_id and condutor_id = v_cond.id
  limit 1;

  -- Registra o marcador de integracao informado pelo entregador.
  update public.condutores
  set fez_integracao = p_com_integracao,
      updated_at = now()
  where id = v_cond.id;

  -- Ja esta na escala (mesmo como ausente/agendado): garante confirmado.
  if v_ag.id is not null then
    update public.agendamentos
    set status = 'confirmado',
        origem = 'sistema',
        updated_at = now()
    where id = v_ag.id;
    return jsonb_build_object('ok', true, 'motivo', 'agendado', 'agendamento_id', v_ag.id, 'ja_existia', true);
  end if;

  -- Vaga nova: respeita a trava de vagas.
  if v_coleta.travar_vagas and public.count_vagas_disponiveis(p_coleta_id) <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'sem_vaga');
  end if;

  insert into public.agendamentos (coleta_id, condutor_id, status, origem)
  values (p_coleta_id, v_cond.id, 'confirmado', 'sistema')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'motivo', 'agendado', 'agendamento_id', v_id);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'motivo', 'ja_agendado');
end;
$$;

grant execute on function public.entregador_agenda(text, text, text) to anon, authenticated, service_role;
grant execute on function public.entregador_agendar(text, uuid, boolean) to anon, authenticated, service_role;

commit;
