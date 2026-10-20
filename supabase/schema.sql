-- ==========================================================================
-- ADN Ensinar — Gestão
-- Esquema inicial: professores, alunos, horário semanal.
-- Correr UMA vez no Supabase: SQL Editor → New query → colar tudo → Run.
-- ==========================================================================

-- ---------- Tabelas ----------

create table if not exists public.professores (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  email       text,
  telefone    text,
  cor         text not null default '#c1dbdc',
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.alunos (
  id                    uuid primary key default gen_random_uuid(),
  nome                  text not null,
  ano_escolar           text,
  escola                text,
  servico               text check (servico in ('Apoio ao Estudo', 'Explicação', 'Ambos')),
  disciplinas           text,
  encarregado_nome      text,
  encarregado_telefone  text,
  encarregado_email     text,
  notas                 text,
  ativo                 boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Uma linha = uma aula recorrente (todas as semanas, no mesmo dia e hora).
create table if not exists public.horario (
  id            uuid primary key default gen_random_uuid(),
  dia_semana    smallint not null check (dia_semana between 1 and 6), -- 1 = segunda … 6 = sábado
  hora_inicio   time not null,
  hora_fim      time not null,
  professor_id  uuid references public.professores(id) on delete set null,
  categoria     text check (categoria in ('Apoio ao Estudo', 'Explicação')),
  disciplina    text,
  sala          text,
  notas         text,
  created_at    timestamptz not null default now(),
  check (hora_fim > hora_inicio)
);

-- Alunos em cada aula (muitos-para-muitos).
create table if not exists public.horario_alunos (
  horario_id  uuid not null references public.horario(id) on delete cascade,
  aluno_id    uuid not null references public.alunos(id) on delete cascade,
  primary key (horario_id, aluno_id)
);

create index if not exists horario_dia_idx on public.horario (dia_semana, hora_inicio);
create index if not exists horario_alunos_aluno_idx on public.horario_alunos (aluno_id);

-- Atualiza updated_at automaticamente.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists alunos_touch on public.alunos;
create trigger alunos_touch before update on public.alunos
  for each row execute function public.touch_updated_at();

-- ---------- Segurança (RLS) ----------
-- Sem sessão iniciada: acesso a nada.
-- Com sessão iniciada: acesso total (por agora só existe 1 utilizador).

alter table public.professores    enable row level security;
alter table public.alunos         enable row level security;
alter table public.horario        enable row level security;
alter table public.horario_alunos enable row level security;

revoke all on public.professores, public.alunos, public.horario, public.horario_alunos from anon;

do $$
declare t text;
begin
  foreach t in array array['professores', 'alunos', 'horario', 'horario_alunos'] loop
    execute format('drop policy if exists "autenticado_tudo" on public.%I', t);
    execute format(
      'create policy "autenticado_tudo" on public.%I for all to authenticated using (true) with check (true)', t
    );
  end loop;
end $$;
