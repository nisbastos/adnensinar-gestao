/* ==========================================================================
   ADN Ensinar — Gestão · inscricao.js
   Converte uma resposta do Formulário de Inscrição numa ficha de aluno e
   uniformiza os dados (maiúsculas, espaços, telefones, códigos postais, turma…).
   Usado em três sítios, com o MESMO código:
     1) importação CSV no site (Importar);
     2) "Uniformizar fichas existentes" no site (Importar);
     3) Google Apps Script que cria o aluno quando chega uma inscrição
        (copiar este ficheiro para "Inscricao.gs").
   Não usa import/export para funcionar nos dois sítios.
   ========================================================================== */

(function (raiz) {
  // ---------- Básicos ----------

  function semAcentos(s) {
    return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function chave(s) { return semAcentos(s).toLowerCase().trim(); }
  function espacos(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
  function vazio(s) { return s == null || espacos(s) === ""; }

  var PARTICULAS = { da: 1, de: 1, di: 1, do: 1, das: 1, dos: 1, e: 1, d: 1 };

  function maiuscula(p) { return p ? p.charAt(0).toLocaleUpperCase("pt-PT") + p.slice(1) : p; }

  /** "maria  DA silva-santos" → "Maria da Silva-Santos" */
  function nomeProprio(s) {
    if (vazio(s)) return null;
    return espacos(s).toLocaleLowerCase("pt-PT").split(" ").map(function (palavra, i) {
      if (i > 0 && PARTICULAS[palavra]) return palavra;
      return palavra.split("-").map(function (p) {
        // D'Oliveira, O'Neill
        return p.split("'").map(maiuscula).join("'");
      }).join("-");
    }).join(" ");
  }

  // Siglas de escolas que ficam sempre em maiúsculas, mesmo que escritas em minúsculas.
  var SIGLAS = { eb: 1, es: 1, ebs: 1, eb1: 1, eb2: 1, eb23: 1, ji: 1, ae: 1, ep: 1, eps: 1, ipca: 1, cic: 1, cics: 1 };

  /** Como nomeProprio, mas mantém siglas escritas em maiúsculas (EB, ES, EBS, AE…). */
  function nomeComSiglas(s) {
    if (vazio(s)) return null;
    var original = espacos(s).split(" ");
    var normal = nomeProprio(s).split(" ");
    return normal.map(function (p, i) {
      var o = original[i] || "";
      var letras = o.replace(/[^A-Za-zÀ-ÿ0-9,/]/g, "");
      var sigla = (letras.length > 0 && letras.length <= 5 && /[A-Z]/.test(letras) && letras === letras.toUpperCase()) ||
        SIGLAS[letras.toLowerCase().replace(/[,/]/g, "")];
      return sigla ? o.toUpperCase() : p;
    }).join(" ");
  }

  /** Primeira letra maiúscula, resto como está. */
  function frase(s) {
    if (vazio(s)) return null;
    var t = espacos(s);
    return maiuscula(t);
  }

  /** "matemática, português e inglês" → "Matemática, Português e Inglês" */
  function lista(s) {
    if (vazio(s)) return null;
    return espacos(s).split(/\s*,\s*/).map(function (item) {
      return item.split(/\s+e\s+/).map(function (x) { return maiuscula(x); }).join(" e ");
    }).join(", ");
  }

  function email(s) {
    if (vazio(s)) return null;
    return String(s).replace(/\s+/g, "").toLowerCase();
  }

  /** "+351912345678", "912345678", "912 34 56 78" → "912 345 678" */
  function telefone(s) {
    if (vazio(s)) return null;
    if (typeof s === "number") s = String(Math.round(s));
    var d = String(s).replace(/\D/g, "");
    if (d.length === 12 && d.indexOf("351") === 0) d = d.slice(3);
    if (d.length === 14 && d.indexOf("00351") === 0) d = d.slice(5);
    if (d.length === 9) return d.slice(0, 3) + " " + d.slice(3, 6) + " " + d.slice(6);
    return espacos(s);
  }

  function nif(s) {
    if (vazio(s)) return null;
    if (typeof s === "number") s = String(Math.round(s));
    var d = String(s).replace(/\D/g, "");
    return d || null;
  }

  /** "4800000", "4800 - 000 Guimarães" → "4800-000" */
  function codigoPostal(s) {
    if (vazio(s)) return null;
    var m = String(s).match(/(\d{4})\s*-?\s*(\d{3})/);
    return m ? m[1] + "-" + m[2] : espacos(s);
  }

  /** "15/3/2013", "15-03-2013", "2013-03-15" → "2013-03-15" */
  function data(s) {
    if (vazio(s)) return null;
    if (Object.prototype.toString.call(s) === "[object Date]") {
      return s.getFullYear() + "-" + String(s.getMonth() + 1).padStart(2, "0") + "-" + String(s.getDate()).padStart(2, "0");
    }
    var t = String(s).trim();
    var m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
    if (m) return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
    m = t.match(/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/); // 2026/05/18 ou 2026-05-18
    return m ? m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0") : null;
  }

  function dataHora(s) {
    if (vazio(s)) return null;
    if (Object.prototype.toString.call(s) === "[object Date]") return s.toISOString();
    var d = data(s);
    if (!d) return null;
    var t = String(s).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    return t ? d + "T" + t[1].padStart(2, "0") + ":" + t[2] + ":" + (t[3] || "00") : d;
  }

  function simNao(s) {
    if (vazio(s)) return null;
    if (s === true || s === false) return s;
    return chave(s).indexOf("nao") !== 0;
  }

  /** "7a", "7 A", "7ºA", "10.B", "11°SE1", "6º", "11 ano" → "7.º A", "10.º B", "11.º SE1", "6.º", "11.º" */
  function anoTurma(s) {
    if (vazio(s)) return null;
    var t = semAcentos(s).toUpperCase().replace(/ANO/g, "").replace(/TURMA/g, "").replace(/[º°ª.\s\-_\/]/g, "");
    var m = t.match(/^(\d{1,2})([A-Z]{1,3}\d{0,2})?$/);
    if (!m) return espacos(s);
    return Number(m[1]) + ".º" + (m[2] ? " " + m[2] : "");
  }

  /** "7.º A" → "7.º ano" */
  function anoEscolar(s) {
    var m = String(s == null ? "" : s).match(/\d{1,2}/);
    if (!m) return null;
    var n = Number(m[0]);
    return n >= 1 && n <= 12 ? n + ".º ano" : null;
  }

  /** "não", "nao", "N", "nenhuma" → "Não" */
  function saude(s) {
    if (vazio(s)) return null;
    var k = chave(s).replace(/[.!]+$/, "");
    if (/^(n|nao|nenhum|nenhuma|nada|sem|-|n\/a|na)$/.test(k)) return "Não";
    return frase(s);
  }

  // ---------- Normalização de uma ficha ----------

  var NORMALIZAR = {
    nome: nomeProprio,
    nome_comum: nomeProprio,
    nif: nif,
    data_nascimento: data,
    morada: function (s) { return vazio(s) ? null : nomeComSiglas(s); },
    codigo_postal: codigoPostal,
    localidade: nomeProprio,
    telemovel_aluno: telefone,
    escola: nomeComSiglas,
    ano_turma: anoTurma,
    dificuldades: lista,
    saude: saude,
    como_conheceu: frase,
    encarregado_nome: nomeProprio,
    encarregado_email: email,
    encarregado_telefone: telefone,
    encarregado_parentesco: frase,
    encarregado_profissao: frase,
    email_institucional: email,
    password_institucional: function (s) { return vazio(s) ? null : String(s).trim(); },
  };

  /** Devolve a ficha com os campos uniformizados (não altera o original). */
  function uniformizar(aluno) {
    var out = {};
    for (var k in aluno) out[k] = aluno[k];
    for (var campo in NORMALIZAR) {
      if (campo in out) out[campo] = NORMALIZAR[campo](out[campo]);
    }
    if ("ano_turma" in out && out.ano_turma) out.ano_escolar = anoEscolar(out.ano_turma) || out.ano_escolar || null;
    return out;
  }

  /** Só os campos que a uniformização muda: { campo: [antes, depois] } */
  function diferencas(aluno) {
    var u = uniformizar(aluno), d = {};
    for (var k in u) {
      var a = aluno[k] == null || aluno[k] === "" ? null : aluno[k], b = u[k] == null || u[k] === "" ? null : u[k];
      if (!(a === null && b === null) && String(a) !== String(b)) d[k] = [aluno[k], u[k]];
    }
    return d;
  }

  // ---------- Formulário → ficha ----------

  // Início do título da pergunta (sem acentos, minúsculas) → coluna; a ordem importa ("email institucional" antes de "email").
  var MAPA = [
    ["carimbo de data", "data_inscricao", dataHora],
    ["nome completo do aluno", "nome"],
    ["nif", "nif"],
    ["data de nascimento", "data_nascimento"],
    ["morada", "morada"],
    ["codigo postal", "codigo_postal"],
    ["localidade", "localidade"],
    ["telemovel do aluno", "telemovel_aluno"],
    ["escola", "escola"],
    ["ano de escolaridade", "ano_turma"],
    ["em que disciplinas", "dificuldades"],
    ["o seu educando tem alguma condicao", "saude"],
    ["como conheceu", "como_conheceu"],
    ["nome completo do encarregado", "encarregado_nome"],
    ["email institucional", "email_institucional"],
    ["password institucional", "password_institucional"],
    ["email", "encarregado_email"],
    ["telemovel", "encarregado_telefone"],
    ["grau de parentesco", "encarregado_parentesco"],
    ["profissao", "encarregado_profissao"],
    ["autorizo a partilha das credenciais", "autoriza_credenciais", simNao],
    ["autorizo a captacao", "autoriza_imagem", simNao],
    ["autorizo a saida", "autoriza_saida", simNao],
    ["declaro que li", "aceita_regulamento", simNao],
  ];

  /** Que coluna da base de dados corresponde a cada cabeçalho (ou null). */
  function mapearCabecalhos(cabecalhos) {
    return cabecalhos.map(function (h) {
      var k = chave(h);
      for (var i = 0; i < MAPA.length; i++) if (k.indexOf(MAPA[i][0]) === 0) return MAPA[i];
      return null;
    });
  }

  /** Uma linha de respostas (cabeçalhos + valores na mesma ordem) → ficha de aluno uniformizada. */
  function linhaParaAluno(cabecalhos, valores) {
    var mapa = mapearCabecalhos(cabecalhos), a = {};
    mapa.forEach(function (m, i) {
      if (!m) return;
      var v = valores[i];
      if (vazio(v)) { a[m[1]] = null; return; }
      a[m[1]] = m[2] ? m[2](v) : v; // datas (Date) e números são tratados em uniformizar()
    });
    if (!a.nome) return null;
    return uniformizar(a);
  }

  raiz.ADN_INSCRICAO = {
    linhaParaAluno: linhaParaAluno,
    mapearCabecalhos: mapearCabecalhos,
    uniformizar: uniformizar,
    diferencas: diferencas,
    chave: chave,
    anoEscolar: anoEscolar,
    _t: { nomeProprio: nomeProprio, nomeComSiglas: nomeComSiglas, telefone: telefone, codigoPostal: codigoPostal, anoTurma: anoTurma, data: data, lista: lista, saude: saude },
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
