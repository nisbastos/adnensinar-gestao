-- ==========================================================================
-- ADN Ensinar — Gestão · 011
-- 1) Mensalidades passam a ser só da Administração (a Gestão nunca as vê).
-- 2) Calendário de testes, fichas, trabalhos e entregas dos alunos.
-- Correr no SQL Editor depois do 010. Pode ser corrido mais do que uma vez.
-- ==========================================================================

-- ---------- 1) Mensalidades só para Admin ----------

create or replace function public.ve_financas() returns boolean
language sql stable security definer set search_path = public as $$
  select public.e_admin();
$$;

update public.utilizadores set ver_financas = false where perfil <> 'admin' and ver_financas;

-- ---------- 2) Calendário ----------

create table if not exists public.avaliacoes (
  id            uuid primary key default gen_random_uuid(),
  data          date not null,
  tipo          text not null default 'Teste'
                check (tipo in ('Teste', 'Ficha', 'Trabalho', 'Apresentação', 'Entrega', 'Oral', 'Outro')),
  disciplina_id uuid references public.disciplinas(id) on delete set null,
  aluno_id      uuid not null references public.alunos(id) on delete cascade,
  aplica_turma  boolean not null default true,   -- vale para os colegas da mesma escola e turma
  notas         text,                            -- matéria, observações
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists avaliacoes_data_idx on public.avaliacoes (data);
create index if not exists avaliacoes_aluno_idx on public.avaliacoes (aluno_id);

drop trigger if exists avaliacoes_touch on public.avaliacoes;
create trigger avaliacoes_touch before update on public.avaliacoes
  for each row execute function public.touch_updated_at();

alter table public.avaliacoes enable row level security;
revoke all on public.avaliacoes from anon;
grant select, insert, update, delete on public.avaliacoes to authenticated;

drop policy if exists admin_tudo on public.avaliacoes;
drop policy if exists ler on public.avaliacoes;
drop policy if exists criar on public.avaliacoes;
drop policy if exists editar on public.avaliacoes;
drop policy if exists tirar on public.avaliacoes;

create policy admin_tudo on public.avaliacoes for all to authenticated using (public.e_admin()) with check (public.e_admin());
-- Professores (Gestão) apontam, corrigem e apagam testes/entregas.
create policy ler    on public.avaliacoes for select to authenticated using (public.e_utilizador());
create policy criar  on public.avaliacoes for insert to authenticated with check (public.e_utilizador());
create policy editar on public.avaliacoes for update to authenticated using (public.e_utilizador()) with check (public.e_utilizador());
create policy tirar  on public.avaliacoes for delete to authenticated using (public.e_utilizador());

do $$
begin
  if exists (select 1 from pg_proc where proname = 'registar_alteracao') then
    drop trigger if exists registar on public.avaliacoes;
    create trigger registar after insert or update or delete on public.avaliacoes
      for each row execute function public.registar_alteracao();
  end if;
end $$;
