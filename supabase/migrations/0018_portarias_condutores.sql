-- Cadastro operacional das portarias de Belo Horizonte e Guarulhos.
-- Dados pessoais não operacionais das planilhas (RG, nascimento e parentes)
-- não são armazenados.
create table if not exists public.portaria_condutores (
  id uuid primary key default gen_random_uuid(),
  portaria text not null check (portaria in ('belo_horizonte', 'guarulhos')),
  condutor_id uuid references public.condutores(id) on delete set null,
  nome text not null,
  cpf text,
  transportadora text,
  local text,
  cargo text,
  agencia text,
  status text,
  aprovacao text,
  data_envio text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portaria_condutores_portaria_cpf_key unique (portaria, cpf),
  constraint portaria_condutores_nome_not_blank check (length(trim(nome)) > 0)
);

create unique index if not exists idx_portaria_condutores_driver
  on public.portaria_condutores (portaria, condutor_id)
  where condutor_id is not null;

create index if not exists idx_portaria_condutores_nome
  on public.portaria_condutores (portaria, lower(nome));

drop trigger if exists trg_portaria_condutores_updated on public.portaria_condutores;
create trigger trg_portaria_condutores_updated
  before update on public.portaria_condutores
  for each row execute function public.set_updated_at();

drop trigger if exists trg_log_portaria_condutores on public.portaria_condutores;
create trigger trg_log_portaria_condutores
  after insert or update or delete on public.portaria_condutores
  for each row execute function public.log_alteracao();

alter table public.portaria_condutores enable row level security;

drop policy if exists "portaria_condutores_select" on public.portaria_condutores;
create policy "portaria_condutores_select" on public.portaria_condutores
  for select using (auth.uid() is not null);

drop policy if exists "portaria_condutores_write" on public.portaria_condutores;
create policy "portaria_condutores_write" on public.portaria_condutores
  for all using (public.get_user_perfil() in ('admin', 'supervisor', 'operador'))
  with check (public.get_user_perfil() in ('admin', 'supervisor', 'operador'));

grant select, insert, update, delete on public.portaria_condutores to authenticated;
grant all on public.portaria_condutores to service_role;

comment on table public.portaria_condutores is
  'Status e dados operacionais de liberação de condutores nas portarias de Belo Horizonte e Guarulhos';

-- Retorna apenas a situação operacional da portaria ao próprio entregador,
-- identificado pelo CPF. Não altera as regras de elegibilidade/agendamento.
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
  v_portarias jsonb;
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'portaria', pc.portaria,
        'situacao', coalesce(nullif(trim(pc.aprovacao), ''), nullif(trim(pc.status), '')),
        'data_envio', pc.data_envio
      )
      order by pc.portaria
    ),
    '[]'::jsonb
  )
  into v_portarias
  from public.portaria_condutores pc
  where pc.condutor_id = v_cond.id
    and translate(
      lower(regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g')),
      'áàâãäéèêëíìîïóòôõöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'
    ) = translate(
      lower(regexp_replace(trim(v_cond.nome_completo), '\s+', ' ', 'g')),
      'áàâãäéèêëíìîïóòôõöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'
    );

  return jsonb_build_object(
    'encontrado', true,
    'condutor', jsonb_build_object(
      'id', v_cond.id,
      'nome', v_cond.nome_completo,
      'cpf', v_cond.cpf,
      'telefone', v_cond.telefone,
      'hub_id', v_cond.hub_id,
      'portarias', v_portarias
    ),
    'slots', v_slots
  );
end;
$$;

grant execute on function public.entregador_agenda(text, text, text)
  to anon, authenticated, service_role;
