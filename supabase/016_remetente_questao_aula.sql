-- ==========================================================================
-- ADN Ensinar — Gestão · 016
-- 1) Nome do remetente das transferências de cada aluno (para associar os
--    movimentos do banco ao aluno certo na página Mensalidades).
-- 2) Novo tipo "Questão de Aula" no Calendário.
-- Correr no SQL Editor depois do 015. Pode ser corrido mais do que uma vez.
-- ==========================================================================

alter table public.alunos add column if not exists remetente_transferencia text;

alter table public.avaliacoes drop constraint if exists avaliacoes_tipo_check;
alter table public.avaliacoes add constraint avaliacoes_tipo_check
  check (tipo in ('Teste', 'Questão de Aula', 'Ficha', 'Trabalho', 'Apresentação', 'Entrega', 'Oral', 'Outro'));
