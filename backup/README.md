# Backup automático diário (Google Drive)

Todos os dias, por volta das 3h, um script na conta Google do ADN lê a base de dados e guarda
um Excel (`ADN Gestão - Backup AAAA-MM-DD.xlsx`) na pasta **ADN Gestão — Backups** da Drive.
Ficam os últimos 30. Não depende do site: lê diretamente o Supabase.

O Excel tem as folhas: Alunos (todos os campos), Mensalidades, Horário, Professores, Salas,
Disciplinas, Preços, Regras e Registo de alterações. É o mesmo ficheiro do botão
**Configuração → Backup → Descarregar Excel**.

## Instalar (uma vez, ~5 min)

1. Entra em <https://script.google.com> com a conta **adnensinar@gmail.com** → **Novo projeto**.
   Dá-lhe o nome `ADN Gestão — Backup`.
2. Apaga o conteúdo de `Código.gs` e cola o conteúdo de [`Codigo.gs`](Codigo.gs).
3. Carrega em **+** (ao lado de "Ficheiros") → **Script** → nome `Folhas` → cola o conteúdo de
   [`Folhas.gs`](Folhas.gs).
4. **Definições do projeto** (roda dentada) → **Propriedades do script** → adiciona:
   - `SUPABASE_URL` = `https://ttnqlwpvrbzcqyqrbalz.supabase.co`
   - `SUPABASE_CHAVE_SECRETA` = a **secret key** do Supabase
     (Supabase → Project Settings → API Keys → *Secret keys*; cria uma chamada `backup-google`).
5. Volta ao editor, escolhe a função **fazerBackup** e carrega em **Executar**.
   Na primeira vez a Google pede autorização (Drive, Folhas de cálculo, pedidos externos) — aceita.
   Confirma que apareceu o ficheiro na pasta **ADN Gestão — Backups**.
6. Escolhe a função **instalarBackupDiario** → **Executar**. Fica agendado.

Se um backup falhar, a Google envia um email automático para a conta do ADN.

## Segurança

- A *secret key* dá acesso total à base de dados. Fica guardada só nas propriedades deste script
  (só a conta do ADN a vê). **Nunca** a coloques no site, no GitHub ou num email.
- O Excel tem dados de menores, saúde e passwords institucionais: a pasta da Drive não deve ser partilhada.
- Se a chave for exposta, apaga-a no Supabase (API Keys) e cria outra.

## Manter atualizado

Se mudar o formato das folhas, o ficheiro `Folhas.gs` aqui é atualizado (é uma cópia de
`js/backup-folhas.js`) — basta voltar a colá-lo no projeto do Apps Script.
