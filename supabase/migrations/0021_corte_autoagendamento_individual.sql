-- ============================================================
-- 0021_corte_autoagendamento_individual.sql
-- 1) Horario de corte do autoagendamento por HUB.
--    Referencia: vespera da coleta. Ex.: corte 21:00 encerra o
--    agendamento das coletas de amanha a partir das 21:00 de hoje.
--    Sem horario definido (null) o comportamento atual e mantido.
-- 2) Elegibilidade individual: liberar uma coleta para um
--    entregador especifico, alem dos grupos.
--
-- Aditivo: nao interfere no que ja esta em producao enquanto
-- horario_corte estiver null e coleta_condutores estiver vazia.
-- ============================================================

-- ------------------------------------------------------------
-- 1) HUB: horario de corte (null = sem corte)
-- ------------------------------------------------------------
alter table public.hubs add column if not exists horario_corte time;

comment on column public.hubs.horario_corte is
'Horario limite (na vespera da coleta) para o entregador se autoagendar neste HUB. null = sem corte';

-- ------------------------------------------------------------
-- 2) Elegibilidade individual por coleta
-- ------------------------------------------------------------
create table if not exists public.coleta_condutores (
  id uuid primary key default gen_random_uuid(),
  coleta_id uuid not null references public.coletas(id) on delete cascade,
  condutor_id uuid not null references public.condutores(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (coleta_id, condutor_id)
);

create index if not exists idx_coleta_condutores_coleta on public.coleta_condutores(coleta_id);
create index if not exists idx_coleta_condutores_condutor on public.coleta_condutores(condutor_id);

grant select, insert, update, delete on public.coleta_condutores to authenticated;
grant all on public.coleta_condutores to service_role;

alter table public.coleta_condutores enable row level security;

drop policy if exists "coleta_condutores_write" on public.coleta_condutores;
create policy "coleta_condutores_write" on public.coleta_condutores
  for all using (public.get_user_perfil() in ('admin', 'supervisor', 'operador'))
  with check (public.get_user_perfil() in ('admin', 'supervisor', 'operador'));

-- ------------------------------------------------------------
-- 3) Coleta encerrada pelo horario de corte (vespera)
-- ------------------------------------------------------------
create or replace function public.coleta_encerrada(p_coleta_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    h.horario_corte is not null
      and now() >= (((c.data_coleta - interval '1 day') + h.horario_corte) at time zone 'America/Sao_Paulo'),
    false
  )
  from public.coletas c
  join public.hubs h on h.id = c.hub_id
  where c.id = p_coleta_id;
$$;

grant execute on function public.coleta_encerrada(uuid) to authenticated, service_role;

-- ------------------------------------------------------------
-- 4) Agenda publica: elegibilidade por grupo OU por entregador
--    individual; expoe se o prazo ja foi encerrado.
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
-- 5) Autoagendamento: elegibilidade por grupo OU individual
--    e bloqueio quando o prazo de corte ja passou.
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

  if v_ag.id is not null and v_ag.status <> 'cancelado' then
    return jsonb_build_object('ok', false, 'motivo', 'ja_agendado', 'agendamento_id', v_ag.id);
  end if;

  if v_coleta.travar_vagas and public.count_vagas_disponiveis(p_coleta_id) <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'sem_vaga');
  end if;

  update public.condutores
  set fez_integracao = p_com_integracao,
      updated_at = now()
  where id = v_cond.id;

  if v_ag.id is not null then
    update public.agendamentos
    set status = 'confirmado', updated_at = now()
    where id = v_ag.id;
    return jsonb_build_object('ok', true, 'motivo', 'agendado', 'agendamento_id', v_ag.id);
  end if;

  insert into public.agendamentos (coleta_id, condutor_id, status)
  values (p_coleta_id, v_cond.id, 'confirmado')
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
