-- ==========================================================================
-- ADN Ensinar — Gestão · 014
-- Duodécimo com valor especial por aluno. Vazio = calculado (mensalidade ÷ meses).
-- Correr no SQL Editor depois do 013. Pode ser corrido mais do que uma vez.
-- ==========================================================================

alter table public.alunos add column if not exists duodecimo_valor numeric(8,2) check (duodecimo_valor is null or duodecimo_valor >= 0);
