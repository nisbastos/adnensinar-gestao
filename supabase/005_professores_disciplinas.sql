-- ==========================================================================
-- ADN Ensinar — Gestão · 005
-- 1) Disciplinas lecionadas por cada professor.
-- 2) Lista de disciplinas do ensino básico e secundário.
-- Correr no SQL Editor depois do 004. Pode ser corrido mais do que uma vez.
-- ==========================================================================

create table if not exists public.professor_disciplinas (
  professor_id   uuid not null references public.professores(id) on delete cascade,
  disciplina_id  uuid not null references public.disciplinas(id) on delete cascade,
  primary key (professor_id, disciplina_id)
);

alter table public.professor_disciplinas enable row level security;
revoke all on public.professor_disciplinas from anon;
drop policy if exists "autenticado_tudo" on public.professor_disciplinas;
create policy "autenticado_tudo" on public.professor_disciplinas
  for all to authenticated using (true) with check (true);

-- A lista de disciplinas é definida no 006_reduzir_disciplinas.sql.
