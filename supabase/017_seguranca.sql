-- ==========================================================================
-- ADN Ensinar — Gestão · 017 — Segurança
-- 1) Contas novas ficam INATIVAS até um Admin as ativar (página Utilizadores).
--    Antes, qualquer conta criada no Supabase ficava logo com acesso aos alunos.
-- 2) Funções internas deixam de poder ser chamadas sem sessão (anon) e as
--    funções de trigger deixam de poder ser chamadas diretamente.
-- 3) search_path fixo em touch_updated_at (aviso do Security Advisor).
-- Pode ser corrido mais do que uma vez.
-- ==========================================================================

alter table public.utilizadores alter column ativo set default false;

revoke execute on function public.e_utilizador(), public.e_admin(), public.ve_financas() from public, anon;
grant execute on function public.e_utilizador(), public.e_admin(), public.ve_financas() to authenticated;

-- Funções de trigger: correm sozinhas nos triggers, ninguém as chama diretamente.
revoke execute on function public.novo_utilizador(), public.registar_alteracao(), public.touch_updated_at()
  from public, anon, authenticated;

alter function public.touch_updated_at() set search_path = public;
