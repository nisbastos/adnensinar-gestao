-- ==========================================================================
-- ADN Ensinar — Gestão · 018
-- Autorização do EE para o tratamento das informações de saúde (formulário de
-- inscrição). Sem autorização, a informação de saúde não é guardada.
-- Vazio = inscrições anteriores à pergunta (autorização por confirmar).
-- ==========================================================================

alter table public.alunos add column if not exists autoriza_saude boolean;
