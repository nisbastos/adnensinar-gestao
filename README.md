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
| `salas.html` | Salas (o horário pode ser visto por sala) |
| `disciplinas.html` | Lista de disciplinas usada no horário e nos alunos |
| `importar.html`, `js/importar.js` | Importação do CSV do Formulário de Inscrição (lido no browser) |
| `js/app.js` | Ligação ao Supabase, proteção das páginas, utilitários |
| `css/app.css` | Estilos (branding do adnensinar.pt) |
| `supabase/schema.sql` | Tabelas e regras de acesso — correr 1.º no SQL Editor |
| `supabase/002_inscricao_salas.sql` | Campos do formulário de inscrição + salas — correr 2.º |
| `supabase/003_tipo_salas.sql` | Tipo de sala (Apoio / Explicação / Ambas) — correr 3.º |
| `supabase/004_disciplinas.sql` | Disciplinas como lista de escolha — correr 4.º |

## Primeira configuração

1. Supabase → SQL Editor → correr `supabase/schema.sql` depois `002_inscricao_salas.sql`, `003_tipo_salas.sql` e `004_disciplinas.sql`.
2. GitHub → Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.
3. Abrir o endereço do Pages e entrar com o utilizador criado no Supabase.
