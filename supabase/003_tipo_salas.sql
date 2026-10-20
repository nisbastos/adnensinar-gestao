-- ==========================================================================
-- ADN Ensinar — Gestão · 003
-- Tipo de sala: Apoio ao Estudo, Explicação ou Ambas.
-- Correr no SQL Editor depois do 002. Pode ser corrido mais do que uma vez.
-- ==========================================================================

alter table public.salas
  add column if not exists tipo text not null default 'Ambas';

alter table public.salas drop constraint if exists salas_tipo_check;
alter table public.salas
  add constraint salas_tipo_check check (tipo in ('Apoio ao Estudo', 'Explicação', 'Ambas'));
