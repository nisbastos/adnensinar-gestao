-- ==========================================================================
-- ADN Ensinar — Gestão · 007
-- 1) Tabela de preços 2026/2027 e definições (inscrição, seguro, duodécimos).
-- 2) Planos de cada aluno (o que paga por mês).
-- 3) Mensalidades (uma linha por aluno e por mês).
-- 4) Registo de alterações (quem mudou o quê e quando) em todas as tabelas.
-- Correr no SQL Editor depois do 006. Pode ser corrido mais do que uma vez.
-- ==========================================================================

-- ---------- 1) Definições e preços ----------

create table if not exists public.definicoes (
  chave      text primary key,
  valor      numeric(10,2) not null,
  descricao  text
);

insert into public.definicoes (chave, valor, descricao) values
  ('valor_inscricao', 40, 'Inscrição (por ano letivo), em €'),
  ('valor_seguro',     0, 'Seguro escolar, somado à inscrição, em €'),
  ('meses_duodecimo',  9, 'N.º de mensalidades pelas quais o valor de junho é repartido'),
  ('desconto_irmao',  10, 'Desconto (%) na mensalidade do irmão mais novo')
on conflict (chave) do nothing;

create table if not exists public.precos (
  id          uuid primary key default gen_random_uuid(),
  nivel       text not null check (nivel in ('1.º ciclo', '2.º ciclo', '3.º ciclo', 'Secundário')),
  servico     text not null check (servico in ('Apoio ao Estudo', 'Explicação')),
  descricao   text not null,
  valor       numeric(8,2) not null,
  ordem       smallint not null default 0,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (nivel, servico, descricao)
);

-- Tabela de Preços 2026/2027 (valores com IVA incluído).
insert into public.precos (nivel, servico, descricao, valor, ordem) values
  ('1.º ciclo',  'Apoio ao Estudo', '1 sessão/semana',  105, 1),
  ('1.º ciclo',  'Apoio ao Estudo', '2 sessões/semana', 110, 2),
  ('1.º ciclo',  'Apoio ao Estudo', '3 sessões/semana', 115, 3),
  ('1.º ciclo',  'Apoio ao Estudo', '4 sessões/semana', 120, 4),
  ('1.º ciclo',  'Apoio ao Estudo', '5 sessões/semana', 125, 5),

  ('2.º ciclo',  'Apoio ao Estudo', '1 sessão/semana',  110, 1),
  ('2.º ciclo',  'Apoio ao Estudo', '2 sessões/semana', 115, 2),
  ('2.º ciclo',  'Apoio ao Estudo', '3 sessões/semana', 120, 3),
  ('2.º ciclo',  'Apoio ao Estudo', '4 sessões/semana', 125, 4),
  ('2.º ciclo',  'Apoio ao Estudo', '5 sessões/semana', 135, 5),
  ('2.º ciclo',  'Explicação',      '4 horas/mês',       80, 11),
  ('2.º ciclo',  'Explicação',      '6 horas/mês',      100, 12),
  ('2.º ciclo',  'Explicação',      '8 horas/mês',      120, 13),
  ('2.º ciclo',  'Explicação',      '1 hora avulso',     22, 14),

  ('3.º ciclo',  'Apoio ao Estudo', '1 sessão/semana',  115, 1),
  ('3.º ciclo',  'Apoio ao Estudo', '2 sessões/semana', 120, 2),
  ('3.º ciclo',  'Apoio ao Estudo', '3 sessões/semana', 125, 3),
  ('3.º ciclo',  'Apoio ao Estudo', '4 sessões/semana', 135, 4),
  ('3.º ciclo',  'Apoio ao Estudo', '5 sessões/semana', 140, 5),
  ('3.º ciclo',  'Explicação',      '4 horas/mês',       85, 11),
  ('3.º ciclo',  'Explicação',      '6 horas/mês',      110, 12),
  ('3.º ciclo',  'Explicação',      '8 horas/mês',      130, 13),
  ('3.º ciclo',  'Explicação',      '1 hora avulso',     25, 14),

  ('Secundário', 'Apoio ao Estudo', '1 sessão/semana',  120, 1),
  ('Secundário', 'Apoio ao Estudo', '2 sessões/semana', 125, 2),
  ('Secundário', 'Apoio ao Estudo', '3 sessões/semana', 135, 3),
  ('Secundário', 'Apoio ao Estudo', '4 sessões/semana', 140, 4),
  ('Secundário', 'Apoio ao Estudo', '5 sessões/semana', 145, 5),
  ('Secundário', 'Explicação',      '4 horas/mês',      105, 11),
  ('Secundário', 'Explicação',      '6 horas/mês',      135, 12),
  ('Secundário', 'Explicação',      '8 horas/mês',      155, 13),
  ('Secundário', 'Explicação',      '1 hora avulso',     28, 14)
on conflict (nivel, servico, descricao) do nothing;

-- ---------- 2) Planos dos alunos ----------

create table if not exists public.aluno_planos (
  id            uuid primary key default gen_random_uuid(),
  aluno_id      uuid not null references public.alunos(id) on delete cascade,
  preco_id      uuid references public.precos(id) on delete set null,
  servico       text check (servico in ('Apoio ao Estudo', 'Explicação')),
  descricao     text,
  valor         numeric(8,2) not null default 0,
  desconto_pct  numeric(5,2) not null default 0 check (desconto_pct between 0 and 100),
  created_at    timestamptz not null default now()
);

create index if not exists aluno_planos_aluno_idx on public.aluno_planos (aluno_id);

-- ---------- 3) Mensalidades ----------

create table if not exists public.mensalidades (
  id           uuid primary key default gen_random_uuid(),
  aluno_id     uuid not null references public.alunos(id) on delete cascade,
  mes          date not null check (extract(day from mes) = 1),
  mensalidade  numeric(8,2) not null default 0,   -- já com desconto
  duodecimo    numeric(8,2) not null default 0,
  inscricao    numeric(8,2) not null default 0,   -- inscrição + seguro
  total        numeric(8,2) generated always as (mensalidade + duodecimo + inscricao) stored,
  estado       text not null default 'Por pagar' check (estado in ('Por pagar', 'Pago', 'Parcial', 'Isento')),
  valor_pago   numeric(8,2),
  pago_em      date,
  metodo       text check (metodo in ('Transferência', 'MB Way', 'Multibanco', 'Numerário', 'Outro')),
  notas        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (aluno_id, mes)
);

create index if not exists mensalidades_mes_idx on public.mensalidades (mes);

drop trigger if exists mensalidades_touch on public.mensalidades;
create trigger mensalidades_touch before update on public.mensalidades
  for each row execute function public.touch_updated_at();

-- ---------- Segurança das novas tabelas ----------

do $$
declare t text;
begin
  foreach t in array array['definicoes', 'precos', 'aluno_planos', 'mensalidades'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists "autenticado_tudo" on public.%I', t);
    execute format('create policy "autenticado_tudo" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- 4) Registo de alterações ----------

create table if not exists public.registo_alteracoes (
  id          bigserial primary key,
  quando      timestamptz not null default now(),
  utilizador  text,
  tabela      text not null,
  operacao    text not null check (operacao in ('INSERT', 'UPDATE', 'DELETE')),
  registo_id  text,
  antes       jsonb,
  depois      jsonb
);

create index if not exists registo_quando_idx on public.registo_alteracoes (quando desc);
create index if not exists registo_tabela_idx on public.registo_alteracoes (tabela, registo_id);

create or replace function public.registar_alteracao() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_antes  jsonb;
  v_depois jsonb;
  v_quem   text;
  v_linha  jsonb;
begin
  if tg_op <> 'INSERT' then v_antes  := to_jsonb(old) - 'updated_at'; end if;
  if tg_op <> 'DELETE' then v_depois := to_jsonb(new) - 'updated_at'; end if;

  -- As passwords institucionais nunca ficam guardadas no registo.
  if v_antes ? 'password_institucional' or v_depois ? 'password_institucional' then
    if tg_op = 'UPDATE'
       and v_antes->>'password_institucional' is distinct from v_depois->>'password_institucional' then
      v_antes  := jsonb_set(v_antes,  '{password_institucional}', to_jsonb('••••'::text));
      v_depois := jsonb_set(v_depois, '{password_institucional}', to_jsonb('•••• (alterada)'::text));
    else
      if v_antes  ? 'password_institucional' then v_antes  := v_antes  - 'password_institucional'; end if;
      if v_depois ? 'password_institucional' then v_depois := v_depois - 'password_institucional'; end if;
    end if;
  end if;

  -- Gravações sem alterações reais não ficam registadas.
  if tg_op = 'UPDATE' and v_antes = v_depois then
    return null;
  end if;

  v_quem := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
    current_user
  );
  v_linha := coalesce(v_depois, v_antes);

  insert into public.registo_alteracoes (utilizador, tabela, operacao, registo_id, antes, depois)
  values (
    v_quem, tg_table_name, tg_op,
    coalesce(v_linha->>'id', v_linha->>'aluno_id', v_linha->>'horario_id', v_linha->>'professor_id', v_linha->>'chave'),
    v_antes, v_depois
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'alunos', 'professores', 'salas', 'disciplinas', 'horario', 'horario_alunos',
    'aluno_disciplinas', 'professor_disciplinas', 'definicoes', 'precos', 'aluno_planos', 'mensalidades'
  ] loop
    execute format('drop trigger if exists registar on public.%I', t);
    execute format('create trigger registar after insert or update or delete on public.%I
                    for each row execute function public.registar_alteracao()', t);
  end loop;
end $$;

-- O registo só pode ser lido (ninguém o edita ou apaga a partir do site).
alter table public.registo_alteracoes enable row level security;
revoke all on public.registo_alteracoes from anon, authenticated;
grant select on public.registo_alteracoes to authenticated;
drop policy if exists "autenticado_ler" on public.registo_alteracoes;
create policy "autenticado_ler" on public.registo_alteracoes
  for select to authenticated using (true);
