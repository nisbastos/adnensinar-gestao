-- ==========================================================================
-- ADN Ensinar — Gestão · 008
-- Nome comum do aluno (como é tratado no dia a dia, ex.: "André" para "José André Silva").
-- Correr no SQL Editor depois do 007. Pode ser corrido mais do que uma vez.
-- ==========================================================================

alter table public.alunos add column if not exists nome_comum text;
