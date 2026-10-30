/* ==========================================================================
   ADN Ensinar — Gestão · Inscrições automáticas
   Sempre que chega uma resposta ao "Formulário de Inscrição", cria (ou atualiza)
   o aluno na base de dados do site, com os dados uniformizados.
   Usa a conversão de "Inscricao.gs" (cópia de js/inscricao.js do site).
   Instruções: apps-script/README.md
   ========================================================================== */

// Folha de respostas do Formulário de Inscrição 2026/2027.
const FOLHA_RESPOSTAS_ID = '1NPDyn0pHDtVHBYuL7iVz8CmCKGCoVFA-1du8IrElLXY';
const SEPARADOR_RESPOSTAS = 'Respostas';

/** Corre a cada nova resposta (agendado por instalarInscricoesAutomaticas). */
function aoReceberInscricao(e) {
  const folha = e && e.range ? e.range.getSheet() : obterFolha_();
  const linha = e && e.range ? e.range.getRow() : folha.getLastRow();
  processarLinha_(folha, linha);
}

/** Para testar: processa a última resposta da folha (pode ser corrido à mão). */
function testarUltimaInscricao() {
  const folha = obterFolha_();
  processarLinha_(folha, folha.getLastRow());
}

/** Liga a criação automática (corre uma vez). */
function instalarInscricoesAutomaticas() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'aoReceberInscricao'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('aoReceberInscricao')
    .forSpreadsheet(SpreadsheetApp.openById(FOLHA_RESPOSTAS_ID))
    .onFormSubmit()
    .create();
  console.log('Inscrições automáticas ligadas.');
}

// ---------- Auxiliares ----------

function obterFolha_() {
  return SpreadsheetApp.openById(FOLHA_RESPOSTAS_ID).getSheetByName(SEPARADOR_RESPOSTAS);
}

function processarLinha_(folha, numLinha) {
  const ultimaColuna = folha.getLastColumn();
  const cabecalhos = folha.getRange(1, 1, 1, ultimaColuna).getValues()[0];
  const valores = folha.getRange(numLinha, 1, 1, ultimaColuna).getValues()[0];

  const aluno = ADN_INSCRICAO.linhaParaAluno(cabecalhos, valores);
  if (!aluno) {
    console.log('Linha ' + numLinha + ' sem nome de aluno — ignorada.');
    return;
  }
  aluno.ativo = true;

  const existente = procurarAluno_(aluno);
  if (existente) {
    // Re-inscrição: atualiza só os campos que vieram preenchidos.
    const alteracoes = {};
    Object.keys(aluno).forEach(function (k) { if (aluno[k] !== null && aluno[k] !== '') alteracoes[k] = aluno[k]; });
    pedido_('patch', '/rest/v1/alunos?id=eq.' + existente.id, alteracoes);
    console.log('Aluno atualizado: ' + aluno.nome);
  } else {
    pedido_('post', '/rest/v1/alunos', aluno);
    console.log('Aluno criado: ' + aluno.nome);
  }
}

/** Mesmo NIF ou, sem NIF, mesmo nome (sem acentos/maiúsculas). */
function procurarAluno_(aluno) {
  const todos = JSON.parse(pedido_('get', '/rest/v1/alunos?select=id,nome,nif'));
  if (aluno.nif) {
    const porNif = todos.filter(function (a) { return a.nif === aluno.nif; })[0];
    if (porNif) return porNif;
  }
  const k = ADN_INSCRICAO.chave(aluno.nome).replace(/\s+/g, ' ');
  return todos.filter(function (a) { return ADN_INSCRICAO.chave(a.nome).replace(/\s+/g, ' ') === k; })[0] || null;
}

function pedido_(metodo, caminho, corpo) {
  const props = PropertiesService.getScriptProperties();
  const url = String(props.getProperty('SUPABASE_URL') || '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  const chave = props.getProperty('SUPABASE_CHAVE_SECRETA');
  if (!url || !chave) throw new Error('Falta definir SUPABASE_URL e SUPABASE_CHAVE_SECRETA nas propriedades do script.');

  const cabecalhos = { apikey: chave, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  if (String(chave).indexOf('eyJ') === 0) cabecalhos.Authorization = 'Bearer ' + chave; // chave antiga (service_role)

  const opcoes = { method: metodo, headers: cabecalhos, muteHttpExceptions: true };
  if (corpo) opcoes.payload = JSON.stringify(corpo);
  const r = UrlFetchApp.fetch(url + caminho, opcoes);
  if (r.getResponseCode() >= 300) {
    throw new Error('Erro ' + r.getResponseCode() + ' em ' + caminho + ': ' + r.getContentText());
  }
  return r.getContentText();
}
