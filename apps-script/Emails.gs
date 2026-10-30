/* ==========================================================================
   ADN Ensinar — Gestão · Emails de pagamento (botões da página Mensalidades)
   • "inicio" — Início do Período de Pagamento (dia 1): todos os encarregados
     de educação dos alunos ativos.
   • "ultimo" — Último Dia para Pagamento (dia 8): só os encarregados dos alunos
     com a mensalidade do mês por pagar (ou paga em parte).
   O site chama este script (publicado como "Aplicação Web") e o script confirma
   que quem carregou no botão é Admin antes de enviar.
   Instruções: apps-script/README.md
   ========================================================================== */

const REMETENTE_NOME = 'ADN Ensinar';
const EMAIL_CENTRO   = 'adnensinar@gmail.com'; // vai no "Para"; encarregados em BCC
const BCC_POR_ENVIO  = 45;
const MBWAY          = '923 371 538';
const IBAN           = 'PT50 0018 0003 5886 5551 0203 2';
const MESES_EMAIL    = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Pedido do site: { tipo: "inicio"|"ultimo", mes: "AAAA-MM-01", teste: bool, token: "<sessão do Supabase>" } */
function doPost(e) {
  try {
    const pedido = JSON.parse(e.postData.contents);
    const quem = verificarAdmin_(pedido.token);
    if (['inicio', 'ultimo'].indexOf(pedido.tipo) < 0) throw new Error('Tipo de email inválido.');
    if (!/^\d{4}-\d{2}-01$/.test(pedido.mes || '')) throw new Error('Mês inválido.');
    const r = enviarEmailPagamento_(pedido.tipo, pedido.mes, !!pedido.teste, quem);
    return resposta_({ ok: true, enviados: r.enviados, alunos: r.alunos, teste: !!pedido.teste });
  } catch (err) {
    return resposta_({ ok: false, erro: String(err && err.message ? err.message : err) });
  }
}

/** Para testar no editor: envia o "inicio" do mês atual só para adnensinar@gmail.com. */
function testarEmailInicio() {
  const mes = Utilities.formatDate(new Date(), 'Europe/Lisbon', 'yyyy-MM') + '-01';
  console.log(JSON.stringify(enviarEmailPagamento_('inicio', mes, true, 'teste no editor')));
}

// ---------- Lógica ----------

function enviarEmailPagamento_(tipo, mesIso, teste, quem) {
  const ano = mesIso.slice(0, 4);
  const mes = MESES_EMAIL[Number(mesIso.slice(5, 7)) - 1];
  const mesCap = mes.charAt(0).toUpperCase() + mes.slice(1);

  const assunto = tipo === 'inicio'
    ? '📚 ADN Ensinar | Início do Período de Pagamento - ' + mesCap + ' ' + ano
    : '📚 ADN Ensinar | Último Dia para Pagamento - ' + mesCap + ' ' + ano;
  const html  = tipo === 'inicio' ? emailHtmlInicio_(mes, ano) : emailHtmlUltimo_(mes, ano);
  const texto = tipo === 'inicio' ? emailTextoInicio_(mes, ano) : emailTextoUltimo_(mes, ano);

  const alvo = destinatarios_(tipo, mesIso);
  if (!teste && alvo.emails.length === 0) {
    throw new Error(tipo === 'ultimo'
      ? 'Não há mensalidades por pagar com email do encarregado neste mês.'
      : 'Não há encarregados com email válido nos alunos ativos.');
  }

  if (teste) {
    MailApp.sendEmail({ to: EMAIL_CENTRO, subject: '[TESTE] ' + assunto, htmlBody: html, body: texto, name: REMETENTE_NOME });
  } else {
    const quota = MailApp.getRemainingDailyQuota();
    if (quota < alvo.emails.length + 1) {
      throw new Error('O Gmail só deixa enviar mais ' + quota + ' emails hoje e são precisos ' +
                      (alvo.emails.length + 1) + '. Tenta amanhã.');
    }
    for (let i = 0; i < alvo.emails.length; i += BCC_POR_ENVIO) {
      MailApp.sendEmail({
        to: EMAIL_CENTRO,
        bcc: alvo.emails.slice(i, i + BCC_POR_ENVIO).join(','),
        subject: assunto, htmlBody: html, body: texto, name: REMETENTE_NOME,
      });
    }
  }

  supabase_('post', '/rest/v1/envios_email', {
    tipo: tipo, mes: mesIso, destinatarios: teste ? 1 : alvo.emails.length,
    alunos: tipo === 'ultimo' ? alvo.alunos.join(', ') : null, teste: teste, enviado_por: quem,
  });
  return { enviados: teste ? 1 : alvo.emails.length, alunos: alvo.alunos };
}

/** Emails dos encarregados (sem repetidos) e, no lembrete, os nomes dos alunos em falta. */
function destinatarios_(tipo, mesIso) {
  const alunos = JSON.parse(supabase_('get', '/rest/v1/alunos?select=id,nome,ativo,encarregado_email'));
  let lista = alunos.filter(function (a) { return a.ativo; });

  if (tipo === 'ultimo') {
    const mens = JSON.parse(supabase_('get',
      '/rest/v1/mensalidades?select=aluno_id,estado&mes=eq.' + mesIso + '&estado=in.(%22Por%20pagar%22,%22Parcial%22)'));
    const emFalta = {};
    mens.forEach(function (m) { emFalta[m.aluno_id] = true; });
    lista = alunos.filter(function (a) { return emFalta[a.id]; });
  }

  const regex = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
  const vistos = {};
  lista.forEach(function (a) {
    String(a.encarregado_email || '').split(/[,;\s]+/).forEach(function (raw) {
      const e = raw.trim().toLowerCase();
      if (e && regex.test(e) && !/\.con$/.test(e)) vistos[e] = true;
    });
  });
  return { emails: Object.keys(vistos), alunos: lista.map(function (a) { return a.nome; }) };
}

/** Confirma, no Supabase, que o token é de um utilizador Admin ativo. Devolve o email. */
function verificarAdmin_(token) {
  if (!token) throw new Error('Sem sessão. Volta a entrar no site.');
  const props = PropertiesService.getScriptProperties();
  const url = String(props.getProperty('SUPABASE_URL') || '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  const chave = props.getProperty('SUPABASE_CHAVE_SECRETA');
  const r = UrlFetchApp.fetch(url + '/auth/v1/user', {
    headers: { apikey: chave, Authorization: 'Bearer ' + token }, muteHttpExceptions: true,
  });
  if (r.getResponseCode() !== 200) throw new Error('Sessão inválida ou expirada. Volta a entrar no site.');
  const user = JSON.parse(r.getContentText());
  const perfil = JSON.parse(supabase_('get', '/rest/v1/utilizadores?select=perfil,ativo&id=eq.' + user.id))[0];
  if (!perfil || !perfil.ativo || perfil.perfil !== 'admin') throw new Error('Só a Administração pode enviar estes emails.');
  return user.email;
}

function supabase_(metodo, caminho, corpo) {
  const props = PropertiesService.getScriptProperties();
  const url = String(props.getProperty('SUPABASE_URL') || '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  const chave = props.getProperty('SUPABASE_CHAVE_SECRETA');
  if (!url || !chave) throw new Error('Falta definir SUPABASE_URL e SUPABASE_CHAVE_SECRETA nas propriedades do script.');
  const cab = { apikey: chave, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  if (String(chave).indexOf('eyJ') === 0) cab.Authorization = 'Bearer ' + chave;
  const opcoes = { method: metodo, headers: cab, muteHttpExceptions: true };
  if (corpo) opcoes.payload = JSON.stringify(corpo);
  const r = UrlFetchApp.fetch(url + caminho, opcoes);
  if (r.getResponseCode() >= 300) throw new Error('Erro ' + r.getResponseCode() + ' em ' + caminho + ': ' + r.getContentText());
  return r.getContentText();
}

function resposta_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Textos dos emails (iguais aos que já eram enviados) ----------

const FONTE = 'font-family:Tahoma,sans-serif;';

function emailAviso_() {
  return '<div style="' + FONTE + '"><span style="background-color:rgb(255,242,204)"><b>' +
    '⚠️ Caso já tenha liquidado o valor da mensalidade, por favor, ignore este email.' +
    '</b></span></div><br>';
}

function emailMetodos_() {
  return '<ul style="' + FONTE + '">' +
    '<li style="margin-left:15px"><b>MB Way</b> para o número <b>' + MBWAY + '</b>, com indicação do nome completo do aluno no descritivo da transferência.</li>' +
    '<li style="margin-left:15px"><b>Transferência Bancária</b> para o IBAN ' + IBAN + '.</li>' +
    '<li style="margin-left:15px"><b>Pagamento em numerário</b> diretamente nas instalações, mediante agendamento prévio.</li>' +
    '</ul>';
}

function emailAssinatura_() {
  return '<div style="' + FONTE + '">' +
    '<b>ADN Ensinar | Centro de Estudos</b><br>' +
    '📍 Avenida Rio de Janeiro, nº 20 - Mesão Frio, Guimarães<br>' +
    '📞 253 714 911<br>' +
    '📧 <a href="mailto:adnensinar@gmail.com">adnensinar@gmail.com</a><br><br>' +
    '<b>Segue o nosso trabalho nas nossas redes sociais!</b><br>' +
    '🌐 Website: <a href="https://www.adnensinar.pt">www.adnensinar.pt</a><br>' +
    '📷 Instagram: <a href="https://www.instagram.com/adn.ensinar/">https://www.instagram.com/adn.ensinar/</a>' +
    '</div>';
}

function emailHtmlInicio_(mes, ano) {
  return emailAviso_() +
    '<div style="' + FONTE + '">' +
    'Caros Pais e Encarregados de Educação,<br><br>' +
    'O Centro de Estudos ADN Ensinar, vem por este meio informar que se <b>iniciou o período de pagamento das mensalidades</b>, ' +
    'referente ao mês de ' + mes + ' de ' + ano + ', que se estende <b>até ao dia 8.</b><br><br>' +
    'Informamos que os métodos de pagamento disponíveis para proceder à regularização da respetiva mensalidade são os seguintes:' +
    '</div>' + emailMetodos_() +
    '<div style="' + FONTE + '">' +
    'Após efetuar o pagamento, deverá enviar via email o comprovativo de pagamento, referindo o nome completo da(o) aluno a que se refere, ' +
    'para o seguinte endereço eletrónico: <a href="mailto:adnensinar@gmail.com">adnensinar@gmail.com</a>. ' +
    'Posteriormente, irá receber no seu endereço eletrónico o respectivo recibo.<br><br>' +
    'Caso necessite de informações sobre a mensalidade a liquidar, por favor, solicite através deste email.<br><br>' +
    'Deste modo e face ao exposto, agradecemos a sua colaboração, estando totalmente disponíveis para qualquer esclarecimento adicional.<br><br>' +
    'Com os melhores cumprimentos,<br><br></div>' + emailAssinatura_();
}

function emailHtmlUltimo_(mes, ano) {
  return emailAviso_() +
    '<div style="' + FONTE + '">' +
    'Caros Pais e Encarregados de Educação,<br><br>' +
    'O Centro de Estudos ADN Ensinar relembra que hoje, <b>dia 8, termina o período de pagamento das mensalidades referentes ao mês de ' +
    mes + ' de ' + ano + '.</b><br><br>' +
    'Para regularizar a situação, poderá utilizar um dos seguintes métodos de pagamento:' +
    '</div>' + emailMetodos_() +
    '<div style="' + FONTE + '">' +
    'Após o pagamento, solicitamos o envio do comprovativo, com a identificação do aluno, para o email ' +
    '<a href="mailto:adnensinar@gmail.com">adnensinar@gmail.com</a>. ' +
    'O respetivo recibo será enviado posteriormente para o mesmo endereço eletrónico.<br><br>' +
    'Caso tenha dúvidas ou necessite de informações sobre o valor a liquidar, estamos disponíveis para ajudar.<br><br>' +
    'Agradecemos a sua atenção e colaboração.<br><br>' +
    'Com os melhores cumprimentos,<br><br></div>' + emailAssinatura_();
}

function emailAssinaturaTexto_() {
  return 'ADN Ensinar | Centro de Estudos\n' +
    '📍 Avenida Rio de Janeiro, nº 20 - Mesão Frio, Guimarães\n📞 253 714 911\n📧 adnensinar@gmail.com\n\n' +
    'Segue o nosso trabalho nas nossas redes sociais!\n🌐 Website: www.adnensinar.pt\n📷 Instagram: https://www.instagram.com/adn.ensinar/';
}

function emailMetodosTexto_() {
  return '- MB Way para o número ' + MBWAY + ', com indicação do nome completo do aluno no descritivo da transferência.\n' +
    '- Transferência Bancária para o IBAN ' + IBAN + '.\n' +
    '- Pagamento em numerário diretamente nas instalações, mediante agendamento prévio.\n\n';
}

function emailTextoInicio_(mes, ano) {
  return '⚠️ Caso já tenha liquidado o valor da mensalidade, por favor, ignore este email.\n\n' +
    'Caros Pais e Encarregados de Educação,\n\n' +
    'O Centro de Estudos ADN Ensinar, vem por este meio informar que se iniciou o período de pagamento das mensalidades, referente ao mês de ' +
    mes + ' de ' + ano + ', que se estende até ao dia 8.\n\n' +
    'Informamos que os métodos de pagamento disponíveis para proceder à regularização da respetiva mensalidade são os seguintes:\n' +
    emailMetodosTexto_() +
    'Após efetuar o pagamento, deverá enviar via email o comprovativo de pagamento, referindo o nome completo da(o) aluno a que se refere, para o seguinte endereço eletrónico: adnensinar@gmail.com. Posteriormente, irá receber no seu endereço eletrónico o respectivo recibo.\n\n' +
    'Caso necessite de informações sobre a mensalidade a liquidar, por favor, solicite através deste email.\n\n' +
    'Deste modo e face ao exposto, agradecemos a sua colaboração, estando totalmente disponíveis para qualquer esclarecimento adicional.\n\n' +
    'Com os melhores cumprimentos,\n\n' + emailAssinaturaTexto_();
}

function emailTextoUltimo_(mes, ano) {
  return '⚠️ Caso já tenha liquidado o valor da mensalidade, por favor, ignore este email.\n\n' +
    'Caros Pais e Encarregados de Educação,\n\n' +
    'O Centro de Estudos ADN Ensinar relembra que hoje, dia 8, termina o período de pagamento das mensalidades referentes ao mês de ' +
    mes + ' de ' + ano + '.\n\n' +
    'Para regularizar a situação, poderá utilizar um dos seguintes métodos de pagamento:\n' +
    emailMetodosTexto_() +
    'Após o pagamento, solicitamos o envio do comprovativo, com a identificação do aluno, para o email adnensinar@gmail.com. O respetivo recibo será enviado posteriormente para o mesmo endereço eletrónico.\n\n' +
    'Caso tenha dúvidas ou necessite de informações sobre o valor a liquidar, estamos disponíveis para ajudar.\n\n' +
    'Agradecemos a sua atenção e colaboração.\n\n' +
    'Com os melhores cumprimentos,\n\n' + emailAssinaturaTexto_();
}
