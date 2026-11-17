-- Marca se existe uma senha MAGALOG registrada nas mensagens.
-- A senha propriamente dita permanece somente em mensagens_magalog.
alter table public.condutores
  add column if not exists tem_senha_magalog boolean not null default false;

comment on column public.condutores.tem_senha_magalog is
  'Indica se o condutor possui senha MAGALOG encontrada nas mensagens, sem armazenar a senha.';
