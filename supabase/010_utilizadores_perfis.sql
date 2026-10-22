-- ==========================================================================
-- ADN Ensinar — Gestão · 010
-- Contas individuais com perfis:
--   • Administração — tudo.
--   • Gestão        — vê e edita alunos e horário; não apaga, não vê configuração,
--                     registo de alterações nem backup.
--   • "Vê mensalidades" (opção por pessoa) — acesso às mensalidades e planos.
-- As regras são aplicadas na base de dados (RLS), não só no site.
-- Correr no SQL Editor depois do 009. Pode ser corrido mais do que uma vez.
-- ==========================================================================

-- ---------- Tabela de utilizadores ----------

create table if not exists public.utilizadores (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  nome          text,
  perfil        text not null default 'gestao' check (perfil in ('admin', 'gestao')),
  ver_financas  boolean not null default false,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Quem já existe (hoje só a conta da Nis) fica como Administração.
insert into public.utilizadores (id, email, perfil, ver_financas)
select id, email, 'admin', true from auth.users
on conflict (id) do nothing;

-- Cada login novo criado no Supabase entra automaticamente como Gestão (sem mensalidades).
create or replace function public.novo_utilizador() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.utilizadores (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists ao_criar_utilizador on auth.users;
create trigger ao_criar_utilizador after insert on auth.users
  for each row execute function public.novo_utilizador();

-- ---------- Funções de permissão ----------

create or replace function public.e_utilizador() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.utilizadores where id = auth.uid() and ativo);
$$;

create or replace function public.e_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.utilizadores where id = auth.uid() and ativo and perfil = 'admin');
$$;

create or replace function public.ve_financas() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.utilizadores where id = auth.uid() and ativo and (perfil = 'admin' or ver_financas));
$$;

-- ---------- Regras de acesso (RLS) ----------

do $$
declare
  t text;
  pol record;
  todas text[] := array[
    'alunos', 'professores', 'salas', 'disciplinas', 'horario', 'horario_alunos', 'aluno_disciplinas',
    'professor_disciplinas', 'precos', 'definicoes', 'aluno_planos', 'mensalidades', 'registo_alteracoes', 'utilizadores'
  ];
begin
  -- Apaga as regras antigas ("qualquer pessoa com login pode tudo").
  foreach t in array todas loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
  end loop;

  -- Administração: tudo (o registo de alterações continua só de leitura).
  foreach t in array todas loop
    if to_regclass('public.' || t) is null or t = 'registo_alteracoes' then continue; end if;
    execute format('create policy admin_tudo on public.%I for all to authenticated using (public.e_admin()) with check (public.e_admin())', t);
  end loop;

  -- Todos os utilizadores ativos: ler alunos, horário e listas.
  foreach t in array array['alunos', 'professores', 'salas', 'disciplinas', 'horario', 'horario_alunos', 'aluno_disciplinas', 'professor_disciplinas'] loop
    execute format('create policy ler on public.%I for select to authenticated using (public.e_utilizador())', t);
  end loop;

  -- Todos os utilizadores ativos: criar e editar alunos e aulas (sem apagar).
  foreach t in array array['alunos', 'horario', 'horario_alunos', 'aluno_disciplinas'] loop
    execute format('create policy criar on public.%I for insert to authenticated with check (public.e_utilizador())', t);
    execute format('create policy editar on public.%I for update to authenticated using (public.e_utilizador()) with check (public.e_utilizador())', t);
  end loop;

  -- Ligações (alunos de uma aula, disciplinas de um aluno): tirar faz parte de editar.
  foreach t in array array['horario_alunos', 'aluno_disciplinas'] loop
    execute format('create policy tirar on public.%I for delete to authenticated using (public.e_utilizador())', t);
  end loop;

  -- Quem vê mensalidades: ler preços; ler/criar/editar planos e mensalidades.
  foreach t in array array['precos', 'definicoes', 'aluno_planos', 'mensalidades'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('create policy financas_ler on public.%I for select to authenticated using (public.ve_financas())', t);
  end loop;
  foreach t in array array['aluno_planos', 'mensalidades'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('create policy financas_criar on public.%I for insert to authenticated with check (public.ve_financas())', t);
    execute format('create policy financas_editar on public.%I for update to authenticated using (public.ve_financas()) with check (public.ve_financas())', t);
  end loop;
  if to_regclass('public.aluno_planos') is not null then
    create policy financas_tirar on public.aluno_planos for delete to authenticated using (public.ve_financas());
  end if;

  -- Registo de alterações: só a Administração lê.
  if to_regclass('public.registo_alteracoes') is not null then
    create policy admin_ler on public.registo_alteracoes for select to authenticated using (public.e_admin());
  end if;
end $$;

-- Cada pessoa vê a sua própria conta (para o site saber o perfil).
create policy proprio on public.utilizadores for select to authenticated using (id = auth.uid());

grant select, insert, update, delete on public.utilizadores to authenticated;

-- Alterações aos utilizadores também ficam no registo.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'registar_alteracao') then
    drop trigger if exists registar on public.utilizadores;
    create trigger registar after insert or update or delete on public.utilizadores
      for each row execute function public.registar_alteracao();
  end if;
end $$;
