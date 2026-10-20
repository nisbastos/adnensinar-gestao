-- ==========================================================================
-- ADN Ensinar — Gestão · 006
-- Reduz a lista de disciplinas às essenciais.
-- As aulas, alunos e professores ligados a uma disciplina retirada passam para
-- a equivalente (ex.: Geografia A/C → Geografia); as restantes ficam sem disciplina.
-- Correr no SQL Editor depois do 005. Pode ser corrido mais do que uma vez.
-- ==========================================================================

insert into public.disciplinas (nome, ordem) values
  ('Português', 1), ('Matemática', 2), ('Inglês', 3), ('Francês', 4), ('Espanhol', 5),
  ('História', 6), ('Geografia', 7), ('Físico-Química', 8), ('Biologia e Geologia', 9),
  ('MACS', 10), ('Geometria Descritiva', 11), ('História da Cultura e das Artes', 12), ('Filosofia', 13)
on conflict (nome) do update set ordem = excluded.ordem;

-- Retirada → equivalente (null = sem equivalente)
drop table if exists pg_temp.mapa_disc;
create temporary table mapa_disc (de text primary key, para text);
insert into mapa_disc values
  ('Matemática A', 'Matemática'), ('Matemática B', 'Matemática'),
  ('Física e Química A', 'Físico-Química'), ('Física', 'Físico-Química'), ('Química', 'Físico-Química'),
  ('Biologia', 'Biologia e Geologia'), ('Geologia', 'Biologia e Geologia'), ('Ciências Naturais', 'Biologia e Geologia'),
  ('História A', 'História'), ('História B', 'História'), ('História e Geografia de Portugal', 'História'),
  ('Geografia A', 'Geografia'), ('Geografia C', 'Geografia'),
  ('Alemão', null), ('Português Língua Não Materna', null), ('Estudo do Meio', null), ('TIC', null),
  ('Educação Visual', null), ('Desenho A', null), ('Economia A', null), ('Economia C', null),
  ('Latim A', null), ('Literatura Portuguesa', null), ('Psicologia B', null), ('Sociologia', null),
  ('Direito', null), ('Ciência Política', null), ('Aplicações Informáticas B', null);

-- Horário
update public.horario h set disciplina_id = novo.id
from public.disciplinas velho
join mapa_disc m on m.de = velho.nome
join public.disciplinas novo on novo.nome = m.para
where h.disciplina_id = velho.id;

-- Alunos e professores (ligações muitos-para-muitos)
insert into public.aluno_disciplinas (aluno_id, disciplina_id)
select ad.aluno_id, novo.id
from public.aluno_disciplinas ad
join public.disciplinas velho on velho.id = ad.disciplina_id
join mapa_disc m on m.de = velho.nome
join public.disciplinas novo on novo.nome = m.para
on conflict do nothing;

insert into public.professor_disciplinas (professor_id, disciplina_id)
select pd.professor_id, novo.id
from public.professor_disciplinas pd
join public.disciplinas velho on velho.id = pd.disciplina_id
join mapa_disc m on m.de = velho.nome
join public.disciplinas novo on novo.nome = m.para
on conflict do nothing;

-- Apaga as retiradas (as ligações antigas são removidas em cascata).
delete from public.disciplinas where nome in (select de from mapa_disc);

drop table if exists pg_temp.mapa_disc;
