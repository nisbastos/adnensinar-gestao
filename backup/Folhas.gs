/* ==========================================================================
   ADN Ensinar — Gestão · backup-folhas.js
   Transforma os dados da base de dados em folhas legíveis (nomes em vez de ids).
   Usado em dois sítios, com o MESMO código:
     1) no site (Configuração → Backup → "Descarregar Excel");
     2) no Google Apps Script do backup automático (copiar este ficheiro para "Folhas.gs").
   Não usa import/export para funcionar nos dois.
   ========================================================================== */

(function (raiz) {
  var DIAS = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

  function porId(lista) {
    var m = {};
    (lista || []).forEach(function (x) { m[x.id] = x; });
    return m;
  }

  function nomeAluno(a) {
    if (!a || !a.nome) return "";
    var w = String(a.nome).trim().split(/\s+/);
    var apelido = w.length > 1 ? w[w.length - 1] : "";
    var comum = String(a.nome_comum || "").trim();
    if (!comum) return [w[0], apelido].filter(Boolean).join(" ");
    var ultima = comum.split(/\s+/).pop().toLowerCase();
    if (apelido && ultima === apelido.toLowerCase()) return comum;
    return [comum, apelido].filter(Boolean).join(" ");
  }

  function simNao(v) { return v === true ? "Sim" : v === false ? "Não" : ""; }
  function hora(t) { return t ? String(t).slice(0, 5) : ""; }
  function data(d) { return d ? String(d).slice(0, 10) : ""; }
  function num(v) { return v === null || v === undefined || v === "" ? "" : Number(v); }
  function txt(v) { return v === null || v === undefined ? "" : v; }

  /** Agrupa uma tabela de ligação: { idDono: [idOutro, ...] } */
  function agrupar(lista, dono, outro) {
    var m = {};
    (lista || []).forEach(function (r) {
      (m[r[dono]] = m[r[dono]] || []).push(r[outro]);
    });
    return m;
  }

  /**
   * dados = { alunos, professores, salas, disciplinas, horario, horario_alunos, aluno_disciplinas,
   *           professor_disciplinas, precos, definicoes, aluno_planos, mensalidades, registo_alteracoes }
   * Devolve [{ nome: "Alunos", linhas: [[cabeçalho...], [valores...], ...] }, ...]
   */
  function construirFolhas(dados) {
    var d = dados || {};
    var alunos = porId(d.alunos), profs = porId(d.professores), salas = porId(d.salas), discs = porId(d.disciplinas);
    var discAluno = agrupar(d.aluno_disciplinas, "aluno_id", "disciplina_id");
    var discProf = agrupar(d.professor_disciplinas, "professor_id", "disciplina_id");
    var alunosAula = agrupar(d.horario_alunos, "horario_id", "aluno_id");
    var planos = agrupar(d.aluno_planos, "aluno_id", "id");
    var planoPorId = porId(d.aluno_planos);
    var nomesDisc = function (ids) {
      return (ids || []).map(function (i) { return discs[i] ? discs[i].nome : ""; }).filter(Boolean).join(", ");
    };
    var profCurto = function (p) { return p ? "Prof. " + String(p.nome).trim().split(/\s+/)[0] : ""; };
    var porNome = function (a, b) { return String(a.nome).localeCompare(String(b.nome), "pt"); };
    var folhas = [];

    // ---- Alunos
    var cabAlunos = [
      "Nome", "Nome comum", "Aparece como", "Ativo", "Ano", "Ano e turma", "Escola", "Serviço", "Disciplinas no centro",
      "Plano(s)", "Planos (€)", "Desconto %", "Meses duodécimo", "Inscrição (€)", "Mensalidade c/ duodécimo (€)", "Data de nascimento", "NIF", "Morada", "Código postal", "Localidade",
      "Telemóvel do aluno", "Encarregado de educação", "Parentesco", "Profissão EE", "Telemóvel EE", "Email EE",
      "Email institucional", "Password institucional", "Autoriza credenciais", "Autoriza imagem", "Autoriza saída",
      "Aceita regulamento", "Saúde / alergias", "Dificuldades", "Como conheceu", "Data de inscrição",
      "Data de desistência", "Notas",
    ];
    var linhasAlunos = (d.alunos || []).slice().sort(porNome).map(function (a) {
      var pl = (planos[a.id] || []).map(function (i) { return planoPorId[i]; });
      var planosT = pl.reduce(function (t, p) { return t + Number(p.valor || 0); }, 0);
      var mens = planosT * (1 - Number(a.desconto_pct || 0) / 100);
      var meses = Number(a.duodecimo_meses || 0);
      var mensal = Math.round((mens + (meses > 0 ? mens / meses : 0)) * 100) / 100;
      return [
        a.nome, txt(a.nome_comum), nomeAluno(a), simNao(a.ativo), txt(a.ano_escolar), txt(a.ano_turma), txt(a.escola),
        txt(a.servico), nomesDisc(discAluno[a.id]),
        pl.map(function (p) {
          return ([p.servico, p.descricao].filter(Boolean).join(" · ") || "Valor manual") + " " + Number(p.valor).toFixed(2) + "€";
        }).join(" + "),
        pl.length ? Math.round(planosT * 100) / 100 : "", num(a.desconto_pct), num(a.duodecimo_meses), num(a.inscricao_valor),
        pl.length ? mensal : "",
        data(a.data_nascimento), txt(a.nif), txt(a.morada), txt(a.codigo_postal), txt(a.localidade),
        txt(a.telemovel_aluno), txt(a.encarregado_nome), txt(a.encarregado_parentesco), txt(a.encarregado_profissao),
        txt(a.encarregado_telefone), txt(a.encarregado_email), txt(a.email_institucional), txt(a.password_institucional),
        simNao(a.autoriza_credenciais), simNao(a.autoriza_imagem), simNao(a.autoriza_saida), simNao(a.aceita_regulamento),
        txt(a.saude), txt(a.dificuldades), txt(a.como_conheceu), data(a.data_inscricao), data(a.data_desistencia), txt(a.notas),
      ];
    });
    folhas.push({ nome: "Alunos", linhas: [cabAlunos].concat(linhasAlunos) });

    // ---- Mensalidades
    var linhasMens = (d.mensalidades || []).slice().sort(function (x, y) {
      return String(y.mes).localeCompare(String(x.mes)) ||
        nomeAluno(alunos[x.aluno_id]).localeCompare(nomeAluno(alunos[y.aluno_id]), "pt");
    }).map(function (m) {
      var a = alunos[m.aluno_id];
      return [
        String(m.mes).slice(0, 7), a ? nomeAluno(a) : "(apagado)", a ? a.nome : "",
        num(m.mensalidade), num(m.duodecimo), num(m.inscricao), num(m.total),
        m.estado, num(m.valor_pago), data(m.pago_em), txt(m.metodo), txt(m.notas),
      ];
    });
    folhas.push({ nome: "Mensalidades", linhas: [[
      "Mês", "Aluno", "Nome completo", "Mensalidade (€)", "Duodécimo (€)", "Inscrição (€)", "Total (€)",
      "Estado", "Valor pago (€)", "Pago em", "Método", "Notas",
    ]].concat(linhasMens) });

    // ---- Horário
    var linhasHor = (d.horario || []).slice().sort(function (x, y) {
      return x.dia_semana - y.dia_semana || String(x.hora_inicio).localeCompare(String(y.hora_inicio));
    }).map(function (h) {
      return [
        DIAS[h.dia_semana] || h.dia_semana, hora(h.hora_inicio), hora(h.hora_fim), txt(h.categoria),
        discs[h.disciplina_id] ? discs[h.disciplina_id].nome : "", salas[h.sala_id] ? salas[h.sala_id].nome : "",
        profCurto(profs[h.professor_id]),
        (alunosAula[h.id] || []).map(function (i) { return nomeAluno(alunos[i]); }).filter(Boolean).join(", "),
        txt(h.notas),
      ];
    });
    folhas.push({ nome: "Horário", linhas: [["Dia", "Início", "Fim", "Categoria", "Disciplina", "Sala", "Professor", "Alunos", "Notas"]].concat(linhasHor) });

    // ---- Professores
    folhas.push({ nome: "Professores", linhas: [["Nome", "Email", "Telefone", "Disciplinas lecionadas", "Ativo"]].concat(
      (d.professores || []).slice().sort(porNome).map(function (p) {
        return [p.nome, txt(p.email), txt(p.telefone), nomesDisc(discProf[p.id]), simNao(p.ativo)];
      })) });

    // ---- Salas
    folhas.push({ nome: "Salas", linhas: [["Nome", "Tipo", "Ordem", "Em uso"]].concat(
      (d.salas || []).slice().sort(function (a, b) { return a.ordem - b.ordem; }).map(function (s) {
        return [s.nome, txt(s.tipo), num(s.ordem), simNao(s.ativo)];
      })) });

    // ---- Disciplinas
    var profsDisc = {};
    (d.professor_disciplinas || []).forEach(function (r) {
      if (profs[r.professor_id]) (profsDisc[r.disciplina_id] = profsDisc[r.disciplina_id] || []).push(profCurto(profs[r.professor_id]));
    });
    folhas.push({ nome: "Disciplinas", linhas: [["Nome", "Professores", "Ordem", "Em uso"]].concat(
      (d.disciplinas || []).slice().sort(function (a, b) { return a.ordem - b.ordem; }).map(function (x) {
        return [x.nome, (profsDisc[x.id] || []).join(", "), num(x.ordem), simNao(x.ativo)];
      })) });

    // ---- Preços e regras
    if ((d.precos || []).length) {
      folhas.push({ nome: "Preços", linhas: [["Nível", "Serviço", "Descrição", "Valor (€)", "Em uso"]].concat(
        d.precos.slice().sort(function (a, b) {
          return String(a.nivel).localeCompare(String(b.nivel)) || String(a.servico).localeCompare(String(b.servico)) || a.ordem - b.ordem;
        }).map(function (p) { return [p.nivel, p.servico, p.descricao, num(p.valor), simNao(p.ativo)]; })) });
    }
    // ---- Registo de alterações (resumo)
    if ((d.registo_alteracoes || []).length) {
      var ACAO = { INSERT: "Criou", UPDATE: "Alterou", DELETE: "Apagou" };
      folhas.push({ nome: "Registo de alterações", linhas: [["Quando", "Quem", "Ação", "Tabela", "Antes", "Depois"]].concat(
        d.registo_alteracoes.map(function (r) {
          return [
            String(r.quando).slice(0, 19).replace("T", " "), txt(r.utilizador), ACAO[r.operacao] || r.operacao, r.tabela,
            r.antes ? JSON.stringify(r.antes) : "", r.depois ? JSON.stringify(r.depois) : "",
          ];
        })) });
    }

    return folhas;
  }

  /** Tabelas a ler da base de dados (e ordem do registo, só os mais recentes). */
  var TABELAS = [
    "alunos", "professores", "salas", "disciplinas", "horario", "horario_alunos", "aluno_disciplinas",
    "professor_disciplinas", "precos", "aluno_planos", "mensalidades", "registo_alteracoes",
  ];

  raiz.ADN_BACKUP = { construirFolhas: construirFolhas, TABELAS: TABELAS, nomeAluno: nomeAluno };
})(typeof globalThis !== "undefined" ? globalThis : this);
