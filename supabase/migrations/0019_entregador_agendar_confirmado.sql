-- Quando o próprio entregador pega a vaga no link público, o agendamento
-- passa a entrar como 'confirmado' (adesão voluntária = já confirmado),
-- em vez de 'agendado'. Substitui somente a função entregador_agendar;
-- as demais regras (elegibilidade, duplicidade, travar vagas) permanecem.

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

grant execute on function public.entregador_agendar(text, uuid) to anon, authenticated, service_role;

commit;
