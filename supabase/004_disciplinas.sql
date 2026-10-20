-- ==========================================================================
-- ADN Ensinar — Gestão · 004
-- Disciplinas passam a ser uma lista fixa (escolha), em vez de texto livre.
--  - horario.disciplina (texto)  → horario.disciplina_id
--  - alunos.disciplinas (texto)  → tabela aluno_disciplinas (várias por aluno)
-- Correr no SQL Editor depois do 003. Pode ser corrido mais do que uma vez.
-- ==========================================================================

create table if not exists public.disciplinas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  ordem       smallint not null default 0,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Disciplinas que aparecem nos horários atuais (podes acrescentar outras na página Disciplinas).
insert into public.disciplinas (nome, ordem) values
  ('Português', 1),
  ('Matemática', 2),
  ('MACS', 3),
  ('História', 4),
  ('Físico-Química', 5),
  ('Biologia e Geologia', 6),
  ('Geometria Descritiva', 7)
on conflict (nome) do nothing;

-- ---------- Horário ----------

alter table public.horario add column if not exists disciplina_id uuid references public.disciplinas(id) on delete set null;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'horario' and column_name = 'disciplina') then
    insert into public.disciplinas (nome, ordem)
      select distinct trim(disciplina), 99 from public.horario where coalesce(trim(disciplina), '') <> ''
      on conflict (nome) do nothing;
    update public.horario h set disciplina_id = d.id
      from public.disciplinas d where h.disciplina_id is null and lower(trim(h.disciplina)) = lower(d.nome);
    alter table public.horario drop column disciplina;
  end if;
end $$;

-- ---------- Alunos ----------

create table if not exists public.aluno_disciplinas (
  aluno_id       uuid not null references public.alunos(id) on delete cascade,
  disciplina_id  uuid not null references public.disciplinas(id) on delete cascade,
  primary key (aluno_id, disciplina_id)
);

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'alunos' and column_name = 'disciplinas') then
    insert into public.disciplinas (nome, ordem)
      select distinct trim(x), 99
      from public.alunos a
      cross join lateral unnest(string_to_array(a.disciplinas, ',')) as x
      where coalesce(trim(x), '') <> ''
      on conflict (nome) do nothing;
    insert into public.aluno_disciplinas (aluno_id, disciplina_id)
      select distinct a.id, d.id
      from public.alunos a
      cross join lateral unnest(string_to_array(a.disciplinas, ',')) as x
      join public.disciplinas d on lower(d.nome) = lower(trim(x))
      on conflict do nothing;
    alter table public.alunos drop column disciplinas;
  end if;
end $$;

-- ---------- Segurança ----------

alter table public.disciplinas       enable row level security;
alter table public.aluno_disciplinas enable row level security;
revoke all on public.disciplinas, public.aluno_disciplinas from anon;

drop policy if exists "autenticado_tudo" on public.disciplinas;
create policy "autenticado_tudo" on public.disciplinas
  for all to authenticated using (true) with check (true);

drop policy if exists "autenticado_tudo" on public.aluno_disciplinas;
create policy "autenticado_tudo" on public.aluno_disciplinas
  for all to authenticated using (true) with check (true);
