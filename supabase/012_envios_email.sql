-- ==========================================================================
-- ADN Ensinar — Gestão · 012
-- Histórico dos emails de pagamento enviados a partir da página Mensalidades
-- (para mostrar quando foi o último envio e evitar envios repetidos).
-- Correr no SQL Editor depois do 011. Pode ser corrido mais do que uma vez.
-- ==========================================================================

create table if not exists public.envios_email (
  id            bigserial primary key,
  tipo          text not null check (tipo in ('inicio', 'ultimo')),
  mes           date not null,
  destinatarios integer not null default 0,
  alunos        text,              -- só no lembrete: alunos com mensalidade por pagar
  teste         boolean not null default false,
  enviado_por   text,
  enviado_em    timestamptz not null default now()
);

create index if not exists envios_email_mes_idx on public.envios_email (mes, tipo);

alter table public.envios_email enable row level security;
revoke all on public.envios_email from anon;
grant select on public.envios_email to authenticated;
drop policy if exists admin_ler on public.envios_email;
create policy admin_ler on public.envios_email for select to authenticated using (public.e_admin());
-- Os registos são escritos pelo Apps Script (chave secreta), não pelo site.
