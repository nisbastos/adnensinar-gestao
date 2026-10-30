# Google Apps Script — automações do ADN Gestão

Um único projeto de Apps Script, na conta **adnensinar@gmail.com**, faz três coisas:

1. **Inscrições automáticas** — sempre que chega uma resposta ao *Formulário de Inscrição*, o aluno é
   criado no site (ou atualizado, se já existir com o mesmo NIF ou nome), com os dados uniformizados:
   nomes com maiúsculas certas, telefones `912 345 678`, código postal `4800-000`, NIF só com números,
   emails em minúsculas, ano/turma `7.º A`, escolas com siglas (`EB`, `ES`).
2. **Backup** — todos os dias às 8h e às 20h guarda um Excel com todos os dados na pasta
   **ADN Gestão — Backups** da Drive (ficam os dos últimos 30 dias).
3. **Emails de pagamento** — os botões da página Mensalidades ("Informação de pagamento" e
   "Lembrete de prazo") enviam os emails a partir da conta do ADN, com os textos de sempre.
   O lembrete só vai para os encarregados com a mensalidade por pagar.

## Ficheiros

| Ficheiro | O quê |
|---|---|
| `Inscricoes.gs` | Cria/atualiza o aluno quando chega uma inscrição |
| `Inscricao.gs` | Conversão e uniformização dos dados (cópia de `js/inscricao.js`) |
| `Backup.gs` | Backup em Excel às 8h e 20h |
| `Folhas.gs` | Folhas do Excel (cópia de `js/backup-folhas.js`) |
| `Emails.gs` | Emails de pagamento (dia 1 e dia 8) pedidos pelo site |

## Instalar (uma vez, ~10 min)

1. Em <https://script.google.com>, com a conta **adnensinar@gmail.com** → **Novo projeto** →
   nome `ADN Gestão — Automações`.
2. Cria 4 ficheiros de script (**+** → **Script**) com os nomes acima e cola o conteúdo de cada um
   (podes apagar o `Código.gs` que vem por defeito).
3. **Definições do projeto** (roda dentada):
   - Fuso horário: **Europe/Lisbon**.
   - **Propriedades do script** → adiciona:
     - `SUPABASE_URL` = `https://ttnqlwpvrbzcqyqrbalz.supabase.co`
     - `SUPABASE_CHAVE_SECRETA` = uma *secret key* do Supabase
       (Project Settings → API Keys → *Secret keys* → criar, ex. `apps-script`).
4. **Testar as inscrições:** escolhe a função `testarUltimaInscricao` → **Executar** (autoriza quando a
   Google pedir). Vê no site, em Alunos, se o último inscrito apareceu/atualizou.
5. **Ligar as inscrições automáticas:** função `instalarInscricoesAutomaticas` → **Executar**.
6. **Testar o backup:** função `fazerBackup` → **Executar** e confirma o ficheiro na pasta
   **ADN Gestão — Backups**.
7. **Ligar o backup diário:** função `instalarBackupDiario` → **Executar**.

### Ligar os botões de email da página Mensalidades

1. Corre no Supabase a migração `supabase/012_envios_email.sql`.
2. No projeto, acrescenta o ficheiro `Emails` (conteúdo de `Emails.gs`) e guarda.
3. (Opcional) Função `testarEmailInicio` → **Executar**: chega um email de teste a adnensinar@gmail.com.
4. **Implementar → Nova implementação** (*Deploy → New deployment*) → tipo **Aplicação Web** (*Web app*):
   - Executar como: **Eu (adnensinar@gmail.com)**
   - Quem tem acesso: **Qualquer pessoa** (*Anyone*) — o script só envia se o pedido vier de um Admin com sessão no site.
5. Copia o **URL da aplicação Web** (termina em `/exec`) e envia-o ao Claude para o ligar ao site
   (fica em `js/app.js`, `URL_EMAILS`).
6. **Desliga a automação antiga** (projeto "Automatização Emails" → Acionadores → apaga os dos dias 1 e 8),
   senão os pais recebem os emails duas vezes.

Se mudares `Emails.gs` depois, é preciso **Implementar → Gerir implementações → editar → Nova versão**
para o site passar a usar a versão nova (o URL mantém-se).

Se alguma execução falhar, a Google envia um email automático para a conta do ADN
(e o erro fica em **Execuções**, no menu da esquerda).

## Segurança

- A *secret key* dá acesso total à base de dados: fica **só** nas propriedades deste script.
  Nunca no site, no GitHub ou num email. Se for exposta, apaga-a no Supabase e cria outra.
- O Excel do backup tem dados de menores, saúde e passwords institucionais: a pasta não deve ser partilhada.

## Manter atualizado

`Inscricao.gs` e `Folhas.gs` são cópias de `js/inscricao.js` e `js/backup-folhas.js`. Quando estes mudarem,
volta a colar a versão nova no projeto.
