-- ==========================================================================
-- ADN Ensinar — Gestão · 015
-- Link para o ficheiro de sumários (Excel na Drive) de cada aluno.
-- Correr no SQL Editor depois do 014. Pode ser corrido mais do que uma vez.
-- ==========================================================================

alter table public.alunos add column if not exists sumario_url text;
