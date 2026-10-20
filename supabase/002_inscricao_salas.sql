-- ==========================================================================
-- ADN Ensinar — Gestão · 002
-- 1) Alunos: todos os campos do Formulário de Inscrição.
-- 2) Salas: tabela própria e ligação ao horário.
-- Correr depois do schema.sql (SQL Editor → New query → colar → Run).
-- Pode ser corrido mais do que uma vez sem estragar nada.
-- ==========================================================================

-- ---------- 1) Alunos ----------

alter table public.alunos
  add column if not exists data_inscricao          timestamptz,
  add column if not exists nif                     text,
  add column if not exists data_nascimento         date,
  add column if not exists morada                  text,
  add column if not exists codigo_postal           text,
  add column if not exists localidade              text,
  add column if not exists telemovel_aluno         text,
  add column if not exists ano_turma               text,   -- tal como vem do formulário
  add column if not exists dificuldades            text,
  add column if not exists saude                   text,
  add column if not exists como_conheceu           text,
  add column if not exists encarregado_parentesco  text,
  add column if not exists encarregado_profissao   text,
  add column if not exists autoriza_credenciais    boolean,
  add column if not exists email_institucional     text,
  add column if not exists password_institucional  text,
  add column if not exists autoriza_imagem         boolean,
  add column if not exists autoriza_saida          boolean,
  add column if not exists aceita_regulamento      boolean,
  add column if not exists data_desistencia        date;

-- ---------- 2) Salas ----------

create table if not exists public.salas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  ordem       smallint not null default 0,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.horario add column if not exists sala_id uuid references public.salas(id) on delete set null;

-- Se já houver aulas com o nome da sala escrito à mão, cria as salas e liga-as.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'horario' and column_name = 'sala') then
    insert into public.salas (nome)
      select distinct trim(sala) from public.horario where coalesce(trim(sala), '') <> ''
      on conflict (nome) do nothing;
    update public.horario h set sala_id = s.id
      from public.salas s where h.sala_id is null and trim(h.sala) = s.nome;
    alter table public.horario drop column sala;
  end if;
end $$;

create index if not exists horario_sala_idx on public.horario (sala_id, dia_semana);

alter table public.salas enable row level security;
revoke all on public.salas from anon;
drop policy if exists "autenticado_tudo" on public.salas;
create policy "autenticado_tudo" on public.salas
  for all to authenticated using (true) with check (true);
