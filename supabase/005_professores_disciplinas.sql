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

-- Disciplinas (as que já existem só mudam de posição na lista; podes editar/desativar na página Disciplinas).
insert into public.disciplinas (nome, ordem) values
  -- Comuns
  ('Português', 1),
  ('Matemática', 2),
  ('Inglês', 3),
  ('Francês', 4),
  ('Espanhol', 5),
  ('Alemão', 6),
  ('Português Língua Não Materna', 7),
  -- 1.º e 2.º ciclo
  ('Estudo do Meio', 10),
  ('História e Geografia de Portugal', 11),
  ('Ciências Naturais', 12),
  -- 3.º ciclo
  ('História', 20),
  ('Geografia', 21),
  ('Físico-Química', 22),
  ('TIC', 23),
  ('Educação Visual', 24),
  -- Secundário
  ('Matemática A', 30),
  ('Matemática B', 31),
  ('MACS', 32),
  ('Física e Química A', 33),
  ('Biologia e Geologia', 34),
  ('Biologia', 35),
  ('Física', 36),
  ('Química', 37),
  ('Geologia', 38),
  ('Geometria Descritiva', 39),
  ('Desenho A', 40),
  ('História A', 41),
  ('História B', 42),
  ('História da Cultura e das Artes', 43),
  ('Geografia A', 44),
  ('Geografia C', 45),
  ('Economia A', 46),
  ('Economia C', 47),
  ('Filosofia', 48),
  ('Latim A', 49),
  ('Literatura Portuguesa', 50),
  ('Psicologia B', 51),
  ('Sociologia', 52),
  ('Direito', 53),
  ('Ciência Política', 54),
  ('Aplicações Informáticas B', 55)
on conflict (nome) do update set ordem = excluded.ordem;
