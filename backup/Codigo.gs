/* ==========================================================================
   ADN Ensinar — Gestão · Backup automático para a Google Drive
   Cria todos os dias um Excel com todos os dados e guarda os últimos 30.
   Instruções: backup/README.md
   ========================================================================== */

const PASTA_NOME = 'ADN Gestão — Backups';
const PREFIXO = 'ADN Gestão - Backup ';
const MANTER = 30;            // n.º de backups a guardar
const MAX_REGISTO = 5000;     // últimas alterações a incluir

/** Corre o backup (é esta a função agendada). */
function fazerBackup() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('SUPABASE_URL');
  const chave = props.getProperty('SUPABASE_CHAVE_SECRETA');
  if (!url || !chave) {
    throw new Error('Falta definir SUPABASE_URL e SUPABASE_CHAVE_SECRETA em Definições do projeto → Propriedades do script.');
  }

  const dados = {};
  ADN_BACKUP.TABELAS.forEach(function (t) { dados[t] = lerTabela_(url, chave, t); });
  const folhas = ADN_BACKUP.construirFolhas(dados);

  const nome = PREFIXO + Utilities.formatDate(new Date(), 'Europe/Lisbon', 'yyyy-MM-dd');
  const ss = SpreadsheetApp.create(nome);
  folhas.forEach(function (f, i) {
    const folha = i === 0 ? ss.getSheets()[0].setName(f.nome) : ss.insertSheet(f.nome);
    const largura = f.linhas[0].length;
    const linhas = f.linhas.map(function (l) {
      const r = l.slice(0, largura);
      while (r.length < largura) r.push('');
      return r.map(function (v) { return v === null || v === undefined ? '' : v; });
    });
    // Colunas de texto ficam como texto (telefones, NIF, códigos postais não viram números/datas).
    f.linhas[0].forEach(function (cab, c) {
      if (!/\(€\)|Ordem/.test(cab)) folha.getRange(1, c + 1, linhas.length, 1).setNumberFormat('@');
    });
    folha.getRange(1, 1, linhas.length, largura).setValues(linhas);
    folha.getRange(1, 1, 1, largura).setFontWeight('bold');
    folha.setFrozenRows(1);
  });
  SpreadsheetApp.flush();

  // Exporta como .xlsx para a pasta de backups e apaga a folha temporária.
  const resposta = UrlFetchApp.fetch(
    'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx',
    { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }
  );
  const pasta = obterPasta_();
  pasta.createFile(resposta.getBlob().setName(nome + '.xlsx'));
  DriveApp.getFileById(ss.getId()).setTrashed(true);
  limparAntigos_(pasta);

  console.log('Backup feito: ' + nome + ' (' + dados.alunos.length + ' alunos, ' + dados.mensalidades.length + ' mensalidades)');
}

/** Agenda o backup para todos os dias por volta das 3h (corre uma vez). */
function instalarBackupDiario() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'fazerBackup'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('fazerBackup').timeBased().everyDays(1).atHour(3).inTimezone('Europe/Lisbon').create();
  console.log('Backup diário agendado para as 3h.');
}

// ---------- Auxiliares ----------

function lerTabela_(url, chave, tabela) {
  const base = String(url).replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  const cabecalhos = { apikey: chave };
  if (String(chave).indexOf('eyJ') === 0) cabecalhos.Authorization = 'Bearer ' + chave; // chave antiga (service_role)
  const linhas = [];
  const passo = 1000;
  for (let de = 0; ; de += passo) {
    const q = base + '/rest/v1/' + tabela + '?select=*' +
      (tabela === 'registo_alteracoes' ? '&order=quando.desc' : '') +
      '&offset=' + de + '&limit=' + passo;
    const r = UrlFetchApp.fetch(q, { headers: cabecalhos, muteHttpExceptions: true });
    const codigo = r.getResponseCode();
    if (codigo === 404) return []; // tabela ainda não existe (migração por correr)
    if (codigo >= 300) throw new Error('Erro a ler ' + tabela + ' (' + codigo + '): ' + r.getContentText());
    const parte = JSON.parse(r.getContentText());
    Array.prototype.push.apply(linhas, parte);
    if (parte.length < passo) break;
    if (tabela === 'registo_alteracoes' && linhas.length >= MAX_REGISTO) break;
  }
  return linhas;
}

function obterPasta_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PASTA_ID');
  if (id) return DriveApp.getFolderById(id);
  const existentes = DriveApp.getFoldersByName(PASTA_NOME);
  const pasta = existentes.hasNext() ? existentes.next() : DriveApp.createFolder(PASTA_NOME);
  props.setProperty('PASTA_ID', pasta.getId());
  return pasta;
}

function limparAntigos_(pasta) {
  const ficheiros = [];
  const it = pasta.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getName().indexOf(PREFIXO) === 0) ficheiros.push(f);
  }
  ficheiros
    .sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); })
    .slice(MANTER)
    .forEach(function (f) { f.setTrashed(true); });
}
