-- ==========================================================================
-- ADN Ensinar — Gestão · 013
-- Coluna "Fatura" nas mensalidades: marca se a fatura já foi passada.
-- Correr no SQL Editor depois do 012. Pode ser corrido mais do que uma vez.
-- ==========================================================================

alter table public.mensalidades add column if not exists fatura_emitida boolean not null default false;
