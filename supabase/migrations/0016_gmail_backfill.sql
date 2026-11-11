-- ============================================================
-- 0016_gmail_backfill.sql
-- Suporte à importação do HISTÓRICO da conta Gmail monitorada.
-- Adiciona o controle de progresso da varredura completa, permitindo
-- retomar de onde parou quando houver muitas páginas de e-mails.
-- Aditivo: não altera nenhum dado existente.
-- ============================================================

alter table public.gmail_sync_state
  add column if not exists backfill_token text,
  add column if not exists backfill_ativo boolean not null default false,
  add column if not exists backfill_iniciado_em timestamptz;

comment on column public.gmail_sync_state.backfill_token is
  'Token da próxima página da importação do histórico (null quando concluída)';
comment on column public.gmail_sync_state.backfill_ativo is
  'Indica que a importação do histórico está em andamento';
