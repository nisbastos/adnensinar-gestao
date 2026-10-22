-- ==========================================================================
-- ADN Ensinar — Gestão · 009
-- Duodécimos, desconto e inscrição passam a ser definidos em cada aluno
-- (na ficha, secção Mensalidade), em vez de regras gerais.
-- Correr no SQL Editor depois do 008. Pode ser corrido mais do que uma vez.
-- ==========================================================================

alter table public.alunos
  add column if not exists duodecimo_meses smallint     default 9  check (duodecimo_meses between 0 and 12),
  add column if not exists desconto_pct    numeric(5,2) default 0  check (desconto_pct between 0 and 100),
  add column if not exists inscricao_valor numeric(8,2) default 40 check (inscricao_valor >= 0);

-- Descontos que estavam em cada plano passam para o aluno (fica o maior).
update public.alunos a
set desconto_pct = p.desc_max
from (
  select aluno_id, max(desconto_pct) as desc_max
  from public.aluno_planos
  where desconto_pct > 0
  group by aluno_id
) p
where p.aluno_id = a.id and coalesce(a.desconto_pct, 0) = 0;

update public.aluno_planos set desconto_pct = 0 where desconto_pct <> 0;
