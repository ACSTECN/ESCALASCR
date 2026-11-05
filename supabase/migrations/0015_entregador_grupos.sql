-- ============================================================
-- 0015_entregador_grupos.sql
-- Lado do entregador: grupos, liberacao de agenda por grupo (elegibilidade),
-- autoagendamento publico por CPF e fila de espera.
--
-- Adaptado do sistema ALX (schema alx) para o schema public do CR.
-- Observacoes de modelagem:
--  - NAO existem turnos: a identidade do "slot" e a coleta
--    (uma coleta por HUB por dia - indice uq_coletas_hub_data).
--  - condutores NAO possui coluna "codigo".
--  - interesses_entregador possui a coluna fez_integracao (nullable).
--
-- Aditivo: nao altera o comportamento atual quando travar_vagas = false.
-- ============================================================

-- ============================================================
-- 1) UTILITARIO: apenas digitos (para comparar CPF com/sem mascara)
-- ============================================================
create or replace function public.only_digits(p text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '');
$$;

-- ============================================================
-- 2) COLUNAS NOVAS
-- ============================================================
alter table public.coletas add column if not exists liberado boolean not null default false;
alter table public.coletas add column if not exists liberado_em timestamptz;
alter table public.coletas add column if not exists travar_vagas boolean not null default false;

alter table public.metas_coletas add column if not exists travar_vagas boolean not null default false;

-- ============================================================
-- 3) TABELAS
-- ============================================================

-- Grupo = nome + membros (a elegibilidade e definida na coleta)
create table if not exists public.grupos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.grupo_condutores (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  condutor_id uuid not null references public.condutores(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (grupo_id, condutor_id)
);

-- Elegibilidade: quais grupos podem pegar cada coleta
create table if not exists public.coleta_grupos (
  id uuid primary key default gen_random_uuid(),
  coleta_id uuid not null references public.coletas(id) on delete cascade,
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (coleta_id, grupo_id)
);

-- ============================================================
-- 4) INDICES
-- ============================================================
create index if not exists idx_grupo_condutores_grupo on public.grupo_condutores(grupo_id);
create index if not exists idx_grupo_condutores_condutor on public.grupo_condutores(condutor_id);
create index if not exists idx_coleta_grupos_grupo on public.coleta_grupos(grupo_id);
create index if not exists idx_coleta_grupos_coleta on public.coleta_grupos(coleta_id);
create index if not exists idx_coletas_liberado on public.coletas(liberado);
create index if not exists idx_condutores_cpf_digits on public.condutores(public.only_digits(cpf));

-- ============================================================
-- 5) GRANTS
-- ============================================================
grant select, insert, update, delete on public.grupos to authenticated;
grant select, insert, update, delete on public.grupo_condutores to authenticated;
grant select, insert, update, delete on public.coleta_grupos to authenticated;
grant all on public.grupos, public.grupo_condutores, public.coleta_grupos to service_role;

-- ============================================================
-- 6) TRIGGERS
-- ============================================================
drop trigger if exists trg_grupos_updated on public.grupos;
create trigger trg_grupos_updated before update on public.grupos
  for each row execute function public.set_updated_at();

-- ============================================================
-- 7) RLS
-- ============================================================
alter table public.grupos enable row level security;
alter table public.grupo_condutores enable row level security;
alter table public.coleta_grupos enable row level security;

drop policy if exists "grupos_write" on public.grupos;
create policy "grupos_write" on public.grupos
  for all using (public.get_user_perfil() in ('admin', 'supervisor', 'operador'))
  with check (public.get_user_perfil() in ('admin', 'supervisor', 'operador'));

drop policy if exists "grupo_condutores_write" on public.grupo_condutores;
create policy "grupo_condutores_write" on public.grupo_condutores
  for all using (public.get_user_perfil() in ('admin', 'supervisor', 'operador'))
  with check (public.get_user_perfil() in ('admin', 'supervisor', 'operador'));

drop policy if exists "coleta_grupos_write" on public.coleta_grupos;
create policy "coleta_grupos_write" on public.coleta_grupos
  for all using (public.get_user_perfil() in ('admin', 'supervisor', 'operador'))
  with check (public.get_user_perfil() in ('admin', 'supervisor', 'operador'));

-- ============================================================
-- 8) PROPAGAR travar_vagas DA META PARA A COLETA (somente no INSERT)
-- ============================================================
create or replace function public.gerar_coletas_recorrentes(
  p_hub_id uuid default null,
  p_data_inicio date default current_date,
  p_data_fim date default (current_date + interval '14 days')::date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta record;
  v_data date;
  v_dia_semana integer;
  v_count integer := 0;
begin
  for v_meta in
    select * from public.metas_coletas
    where ativo = true
      and (p_hub_id is null or hub_id = p_hub_id)
  loop
    v_data := p_data_inicio;
    while v_data <= p_data_fim loop
      v_dia_semana := extract(dow from v_data)::integer;
      if v_dia_semana = v_meta.dia_semana then
        insert into public.coletas (hub_id, data_coleta, horario, meta, travar_vagas)
        values (v_meta.hub_id, v_data, v_meta.horario, v_meta.meta, coalesce(v_meta.travar_vagas, false))
        on conflict (hub_id, data_coleta) do update
          set horario = excluded.horario,
              meta = excluded.meta,
              updated_at = now();
        v_count := v_count + 1;
      end if;
      v_data := v_data + 1;
    end loop;
  end loop;
  return v_count;
end;
$$;

-- ============================================================
-- 9) TRAVA DE VAGAS OPCIONAL
--    So bloqueia quando a coleta tem travar_vagas = true.
--    Com travar_vagas = false (padrao) o comportamento atual e mantido.
-- ============================================================
create or replace function public.check_vaga_disponivel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_travar boolean;
begin
  if new.status = 'cancelado' then
    return new;
  end if;

  select travar_vagas into v_travar from public.coletas where id = new.coleta_id;

  if coalesce(v_travar, false) then
    if public.count_vagas_disponiveis(new.coleta_id) <= 0 then
      raise exception 'Meta de coletas atingida. Nao ha vagas disponiveis.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_vaga on public.agendamentos;
create trigger trg_check_vaga
  before insert on public.agendamentos
  for each row execute function public.check_vaga_disponivel();

-- ============================================================
-- 10) FUNCOES PUBLICAS DO ENTREGADOR (SECURITY DEFINER -> anon)
-- ============================================================

-- 10.1) Agenda visivel: somente coletas LIBERADAS para algum grupo do entregador.
--       Nao expoe meta nem a quantidade de agendamentos, apenas "disponivel".
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
      'disponivel', (not c.travar_vagas) or public.count_vagas_disponiveis(c.id) > 0,
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
      and exists (
        select 1
        from public.coleta_grupos cg
        join public.grupo_condutores gc on gc.grupo_id = cg.grupo_id
        join public.grupos g on g.id = cg.grupo_id
        where cg.coleta_id = c.id
          and gc.condutor_id = v_cond.id
          and g.ativo = true
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

-- 10.2) O entregador pega a vaga -> agendamento automatico.
--       Respeita liberacao, elegibilidade, duplicidade e travar_vagas.
create or replace function public.entregador_agendar(
  p_cpf text,
  p_coleta_id uuid
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

  -- Serializa as tentativas na mesma coleta
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

  select exists (
    select 1
    from public.coleta_grupos cg
    join public.grupo_condutores gc on gc.grupo_id = cg.grupo_id
    join public.grupos g on g.id = cg.grupo_id
    where cg.coleta_id = p_coleta_id
      and gc.condutor_id = v_cond.id
      and g.ativo = true
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

  if v_ag.id is not null then
    update public.agendamentos
    set status = 'agendado', updated_at = now()
    where id = v_ag.id;
    return jsonb_build_object('ok', true, 'motivo', 'agendado', 'agendamento_id', v_ag.id);
  end if;

  insert into public.agendamentos (coleta_id, condutor_id, status)
  values (p_coleta_id, v_cond.id, 'agendado')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'motivo', 'agendado', 'agendamento_id', v_id);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'motivo', 'ja_agendado');
end;
$$;

-- 10.3) Sem vaga -> entra na lista de espera existente.
create or replace function public.entregador_lista_espera(
  p_nome text,
  p_cpf text,
  p_telefone text,
  p_coleta_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cpf text := public.only_digits(p_cpf);
  v_coleta public.coletas;
  v_existe boolean;
begin
  select * into v_coleta from public.coletas where id = p_coleta_id;
  if v_coleta.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'coleta_invalida');
  end if;

  select exists (
    select 1
    from public.interesses_entregador
    where public.only_digits(cpf) = v_cpf
      and hub_id = v_coleta.hub_id
      and data_interesse = v_coleta.data_coleta
  ) into v_existe;

  if v_existe then
    return jsonb_build_object('ok', false, 'motivo', 'ja_na_lista');
  end if;

  insert into public.interesses_entregador
    (nome, cpf, telefone, hub_id, data_interesse, status, fez_integracao)
  values (
    coalesce(nullif(trim(p_nome), ''), 'Entregador'),
    v_cpf,
    nullif(trim(p_telefone), ''),
    v_coleta.hub_id,
    v_coleta.data_coleta,
    'pendente',
    null
  );

  return jsonb_build_object('ok', true, 'motivo', 'na_lista');
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'motivo', 'ja_na_lista');
end;
$$;

-- ============================================================
-- 11) EXECUTE PARA ANON (link publico do entregador)
-- ============================================================
grant execute on function public.only_digits(text) to anon, authenticated, service_role;
grant execute on function public.entregador_agenda(text, text, text) to anon, authenticated, service_role;
grant execute on function public.entregador_agendar(text, uuid) to anon, authenticated, service_role;
grant execute on function public.entregador_lista_espera(text, text, text, uuid) to anon, authenticated, service_role;

comment on table public.grupos is
'Grupo de entregadores (nome + membros) usado para liberar agendas';
comment on table public.coleta_grupos is
'Define para quais grupos uma coleta foi liberada (elegibilidade do entregador)';
comment on function public.entregador_agenda(text, text, text) is
'Agenda publica do entregador: retorna apenas coletas liberadas para os grupos dele, sem expor quantidade de vagas';
