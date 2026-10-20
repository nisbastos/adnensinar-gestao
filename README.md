# ADN Ensinar — Gestão

Centro de operações interno do ADN Ensinar: horário semanal, alunos e professores.
Acesso só com login.

## Como está montado

- **Site:** HTML, CSS e JavaScript simples (sem build), alojado no GitHub Pages.
- **Dados e login:** Supabase (região UE). As regras de acesso (RLS) em `supabase/schema.sql`
  garantem que sem sessão iniciada não se lê nem escreve nada.
- A chave em `js/app.js` é a chave **pública** (publishable) do Supabase — pode estar no código.
  A chave secreta / service_role **nunca** entra neste repositório.

## Estrutura

| Ficheiro | O quê |
|---|---|
| `index.html` | Login |
| `horario.html`, `js/horario.js` | Horário semanal (aulas recorrentes) |
| `alunos.html`, `js/alunos.js` | Lista e ficha de alunos |
| `professores.html` | Professores e cor de cada um no horário |
| `js/app.js` | Ligação ao Supabase, proteção das páginas, utilitários |
| `css/app.css` | Estilos (branding do adnensinar.pt) |
| `supabase/schema.sql` | Tabelas e regras de acesso — correr no SQL Editor do Supabase |

## Primeira configuração

1. Supabase → SQL Editor → colar `supabase/schema.sql` → Run.
2. GitHub → Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.
3. Abrir o endereço do Pages e entrar com o utilizador criado no Supabase.
