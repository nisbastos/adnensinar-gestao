# Google Apps Script — automações do ADN Gestão

Um único projeto de Apps Script, na conta **adnensinar@gmail.com**, faz duas coisas:

1. **Inscrições automáticas** — sempre que chega uma resposta ao *Formulário de Inscrição*, o aluno é
   criado no site (ou atualizado, se já existir com o mesmo NIF ou nome), com os dados uniformizados:
   nomes com maiúsculas certas, telefones `912 345 678`, código postal `4800-000`, NIF só com números,
   emails em minúsculas, ano/turma `7.º A`, escolas com siglas (`EB`, `ES`).
2. **Backup diário** — todos os dias por volta das 3h guarda um Excel com todos os dados na pasta
   **ADN Gestão — Backups** da Drive (ficam os últimos 30).

## Ficheiros

| Ficheiro | O quê |
|---|---|
| `Inscricoes.gs` | Cria/atualiza o aluno quando chega uma inscrição |
| `Inscricao.gs` | Conversão e uniformização dos dados (cópia de `js/inscricao.js`) |
| `Backup.gs` | Backup diário em Excel |
| `Folhas.gs` | Folhas do Excel (cópia de `js/backup-folhas.js`) |

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

Se alguma execução falhar, a Google envia um email automático para a conta do ADN
(e o erro fica em **Execuções**, no menu da esquerda).

## Segurança

- A *secret key* dá acesso total à base de dados: fica **só** nas propriedades deste script.
  Nunca no site, no GitHub ou num email. Se for exposta, apaga-a no Supabase e cria outra.
- O Excel do backup tem dados de menores, saúde e passwords institucionais: a pasta não deve ser partilhada.

## Manter atualizado

`Inscricao.gs` e `Folhas.gs` são cópias de `js/inscricao.js` e `js/backup-folhas.js`. Quando estes mudarem,
volta a colar a versão nova no projeto.
