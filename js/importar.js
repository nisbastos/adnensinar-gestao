import { sb, requireAuth, esc, toast, failed, norm, ANOS, DIAS_CURTOS, CORES, euro } from "./app.js";

await requireAuth();

const $ = (id) => document.getElementById(id);

// A conversão e a uniformização das respostas do formulário estão em js/inscricao.js
// (o mesmo código usado pelo Google Apps Script que cria os alunos automaticamente).
const INSC = globalThis.ADN_INSCRICAO;

// ---------- CSV ----------

function parseCSV(texto) {
  const linhas = [];
  let linha = [], campo = "", aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = "";
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => l.some((x) => x.trim() !== ""));
}

// ---------- Fluxo ----------

let plano = []; // { acao: "novo" | "atualizar", id?, dados }

$("ficheiro").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const linhas = parseCSV((await f.text()).replace(/^﻿/, ""));
  if (linhas.length < 2) return toast("O ficheiro não tem linhas de dados.", true);

  const colunas = INSC.mapearCabecalhos(linhas[0]);
  if (!colunas.some((c) => c?.[1] === "nome")) {
    return toast('Não encontrei a coluna "Nome Completo do Aluno". É o CSV do formulário?', true);
  }

  const { data: existentes, error } = await sb.from("alunos").select("id, nome, nif");
  if (failed(error, "Erro a ler alunos existentes")) return;
  const porNif = new Map(existentes.filter((a) => a.nif).map((a) => [a.nif, a.id]));
  const porNome = new Map(existentes.map((a) => [norm(a.nome).trim(), a.id]));

  const desist = $("tipo").value === "desistencias";
  plano = [];
  for (const l of linhas.slice(1)) {
    const dados = INSC.linhaParaAluno(linhas[0], l);
    if (!dados) continue;
    dados.ativo = !desist;

    const id = (dados.nif && porNif.get(dados.nif)) || porNome.get(norm(dados.nome).trim());
    plano.push({ acao: id ? "atualizar" : "novo", id, dados });
  }

  const novos = plano.filter((p) => p.acao === "novo").length;
  $("resumo").innerHTML = `<strong>${plano.length}</strong> linhas lidas: <strong>${novos}</strong> alunos novos e <strong>${plano.length - novos}</strong> a atualizar${desist ? " (todos ficam <strong>inativos</strong>)" : ""}. Confirma e carrega em Importar.`;
  $("linhas").innerHTML = plano.map((p) => `
    <tr>
      <td>${p.acao === "novo" ? '<span class="badge badge--green">Novo</span>' : '<span class="badge badge--yellow">Atualizar</span>'}</td>
      <td>${esc(p.dados.nome)}</td>
      <td>${esc(p.dados.ano_turma) || '<span class="muted">—</span>'}</td>
      <td>${esc(p.dados.escola) || '<span class="muted">—</span>'}</td>
      <td>${esc(p.dados.encarregado_nome) || '<span class="muted">—</span>'}</td>
    </tr>`).join("");
  $("preview").hidden = false;
});

$("cancelar").addEventListener("click", () => {
  plano = [];
  $("preview").hidden = true;
  $("ficheiro").value = "";
});

$("confirmar").addEventListener("click", async () => {
  const btn = $("confirmar");
  btn.disabled = true;
  btn.textContent = "A importar…";
  let ok = 0, erros = 0;

  const novos = plano.filter((p) => p.acao === "novo").map((p) => p.dados);
  if (novos.length) {
    const { error } = await sb.from("alunos").insert(novos);
    if (failed(error, "Erro a inserir alunos novos")) erros += novos.length;
    else ok += novos.length;
  }
  for (const p of plano.filter((p) => p.acao === "atualizar")) {
    const { error } = await sb.from("alunos").update(p.dados).eq("id", p.id);
    if (error) { erros++; console.error(error); } else ok++;
  }

  btn.disabled = false;
  btn.textContent = "Importar";
  if (erros) toast(`${ok} importados, ${erros} com erro (ver consola).`, true);
  else {
    toast(`${ok} alunos importados.`);
    setTimeout(() => location.assign("alunos.html"), 1200);
  }
});


// ==========================================================================
// Importação do horário (JSON preparado a partir dos documentos da Drive)
// ==========================================================================


const ALCUNHAS = { "ze": "jose", "zé": "jose" };

/** Associa um nome curto ("Gui Novais", "Francisca 7", "M. Miguel") a um aluno ativo, se for inequívoco. */
function associar(curto, lista) {
  const partes = norm(curto).replace(/\./g, ". ").split(/\s+/).filter(Boolean);
  const ano = partes.find((t) => /^\d{1,2}$/.test(t));
  const palavras = partes.filter((t) => !/^\d{1,2}$/.test(t)).map((t) => ALCUNHAS[t] ?? t);
  if (!palavras.length) return null;
  const encaixa = (token, palavra) => token.endsWith(".") ? palavra.startsWith(token.slice(0, -1)) : palavra.startsWith(token);

  const encaixaNome = (nome) => {
    const w = norm(nome).split(/\s+/);
    if (!encaixa(palavras[0], w[0])) return false;
    let i = 1;
    for (const t of palavras.slice(1)) {
      while (i < w.length && !encaixa(t, w[i])) i++;
      if (i >= w.length) return false;
      i++;
    }
    return true;
  };

  const candidatos = lista.filter((a) => {
    // Tenta o nome completo e também "nome comum + apelidos" (ex.: "André Silva" para "José André Silva").
    const variantes = [a.nome];
    if (a.nome_comum) variantes.push(`${a.nome_comum} ${String(a.nome).trim().split(/\s+/).slice(1).join(" ")}`);
    if (!variantes.some(encaixaNome)) return false;
    if (ano) {
      const n = (a.ano_turma ?? a.ano_escolar ?? "").match(/\d{1,2}/)?.[0];
      if (n !== ano) return false;
    }
    return true;
  });
  return candidatos.length === 1 ? candidatos[0] : null;
}

let planoHorario = null;

$("ficheiro-horario").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  let dados;
  try { dados = JSON.parse(await f.text()); } catch { return toast("O ficheiro não é um JSON válido.", true); }
  if (dados.formato !== "adn-horario-v1") return toast("Este ficheiro não é um horário do ADN Ensinar.", true);

  const [ra, rs, rp, rh, rd] = await Promise.all([
    sb.from("alunos").select("id, nome, nome_comum, ano_escolar, ano_turma, ativo"),
    sb.from("salas").select("*"),
    sb.from("professores").select("*"),
    sb.from("horario").select("dia_semana, hora_inicio, sala_id, categoria"),
    sb.from("disciplinas").select("*"),
  ]);
  if (failed(ra.error, "Erro a ler alunos") || failed(rs.error, "Erro a ler salas") || failed(rp.error, "Erro a ler professores") || failed(rh.error, "Erro a ler horário") || failed(rd.error, "Erro a ler disciplinas")) return;

  const ativos = ra.data.filter((a) => a.ativo);
  const salaExistente = (nome) => rs.data.find((s) => norm(s.nome) === norm(nome) || norm(s.nome) === norm("Sala " + nome));
  const profExistente = (nome) => {
    const m = rp.data.filter((p) => norm(p.nome).split(/\s+/)[0] === norm(nome).split(/\s+/)[0]);
    return m.length === 1 ? m[0] : null;
  };

  const aulas = dados.aulas.map((a) => {
    const assoc = [], falta = [];
    for (const n of a.alunos) {
      const al = associar(n, ativos);
      al ? assoc.push(al) : falta.push(n);
    }
    return { ...a, assoc, falta };
  });

  const discExistente = (nome) => rd.data.find((d) => norm(d.nome) === norm(nome));
  const nomesDisc = [...new Set(dados.aulas.map((a) => a.disciplina).filter(Boolean))];

  planoHorario = {
    dados, aulas, existentes: rh.data, discExistente, nomesDisc,
    discNovas: nomesDisc.filter((n) => !discExistente(n)),
    salasNovas: dados.salas.filter((s) => !salaExistente(s.nome)),
    profsNovos: dados.professores.filter((p) => !profExistente(p)),
    salaExistente, profExistente,
  };

  const totalNomes = aulas.reduce((n, a) => n + a.alunos.length, 0);
  const totalFalta = aulas.reduce((n, a) => n + a.falta.length, 0);
  $("resumo-horario").innerHTML =
    `<strong>${aulas.length}</strong> aulas. ` +
    `Salas novas: <strong>${planoHorario.salasNovas.map((s) => esc(s.nome)).join(", ") || "nenhuma"}</strong>. ` +
    `Professores novos: <strong>${planoHorario.profsNovos.map(esc).join(", ") || "nenhum"}</strong>. ` +
    `Disciplinas novas: <strong>${planoHorario.discNovas.map(esc).join(", ") || "nenhuma"}</strong>. ` +
    `Alunos associados: <strong>${totalNomes - totalFalta}</strong> de ${totalNomes}` +
    (totalFalta ? ` — os restantes ficam nas notas da aula.` : ".");

  $("linhas-horario").innerHTML = aulas
    .sort((x, y) => x.dia - y.dia || x.inicio.localeCompare(y.inicio))
    .map((a) => `
      <tr>
        <td>${DIAS_CURTOS[a.dia]}</td>
        <td class="small">${a.inicio}–${a.fim}</td>
        <td>${esc(a.sala)}</td>
        <td class="small">${esc(a.disciplina ?? a.categoria)}${a.professor ? " · " + esc(a.professor) : ""}</td>
        <td class="small">${a.assoc.map((x) => esc(x.nome)).join(", ") || '<span class="muted">—</span>'}</td>
        <td class="small">${a.falta.map((x) => `<span class="badge badge--pink">${esc(x)}</span>`).join(" ") || '<span class="muted">—</span>'}</td>
      </tr>`).join("");
  $("preview-horario").hidden = false;
});

$("cancelar-horario").addEventListener("click", () => {
  planoHorario = null;
  $("preview-horario").hidden = true;
  $("ficheiro-horario").value = "";
});

$("confirmar-horario").addEventListener("click", async () => {
  if (!planoHorario) return;
  const btn = $("confirmar-horario");
  btn.disabled = true;
  btn.textContent = "A importar…";
  try {
    const p = planoHorario;

    // 1) Salas e professores em falta
    const salaId = new Map();
    for (const s of p.dados.salas) {
      const ex = p.salaExistente(s.nome);
      if (ex) { salaId.set(s.nome, ex.id); continue; }
      const { data, error } = await sb.from("salas")
        .insert({ nome: s.nome, tipo: s.tipo, ordem: p.dados.salas.indexOf(s) + 1 }).select("id").single();
      if (failed(error, `Erro a criar a sala ${s.nome}`)) return;
      salaId.set(s.nome, data.id);
    }
    const profId = new Map();
    let k = 0;
    for (const nome of p.dados.professores) {
      const ex = p.profExistente(nome);
      if (ex) { profId.set(nome, ex.id); continue; }
      const { data, error } = await sb.from("professores")
        .insert({ nome, cor: CORES[k++ % CORES.length] }).select("id").single();
      if (failed(error, `Erro a criar o professor ${nome}`)) return;
      profId.set(nome, data.id);
    }

    const discId = new Map();
    for (const nome of p.nomesDisc) {
      const ex = p.discExistente(nome);
      if (ex) { discId.set(nome, ex.id); continue; }
      const { data, error } = await sb.from("disciplinas").insert({ nome, ordem: 99 }).select("id").single();
      if (failed(error, `Erro a criar a disciplina ${nome}`)) return;
      discId.set(nome, data.id);
    }

    // 2) Aulas (sem duplicar)
    let criadas = 0, saltadas = 0;
    for (const a of p.aulas) {
      const sid = salaId.get(a.sala) ?? null;
      const dup = p.existentes.some((h) =>
        h.dia_semana === a.dia && String(h.hora_inicio).slice(0, 5) === a.inicio && h.sala_id === sid && h.categoria === a.categoria);
      if (dup) { saltadas++; continue; }

      const notas = [a.notas, a.falta.length ? `Alunos por associar: ${a.falta.join(", ")}` : null].filter(Boolean).join("\n") || null;
      const { data, error } = await sb.from("horario").insert({
        dia_semana: a.dia, hora_inicio: a.inicio, hora_fim: a.fim, sala_id: sid,
        categoria: a.categoria, disciplina_id: a.disciplina ? discId.get(a.disciplina) : null, professor_id: a.professor ? profId.get(a.professor) : null, notas,
      }).select("id").single();
      if (failed(error, "Erro a criar aula")) return;
      const ids = [...new Set(a.assoc.map((x) => x.id))];
      if (ids.length) {
        const { error: e2 } = await sb.from("horario_alunos").insert(ids.map((aluno_id) => ({ horario_id: data.id, aluno_id })));
        if (failed(e2, "Erro a associar alunos")) return;
      }
      criadas++;
    }
    toast(`${criadas} aulas importadas${saltadas ? `, ${saltadas} já existiam` : ""}.`);
    setTimeout(() => location.assign("horario.html"), 1400);
  } finally {
    btn.disabled = false;
    btn.textContent = "Importar horário";
  }
});


// ==========================================================================
// Importação dos planos de mensalidade (folha "Mensalidades" do Balanço Mensal)
// ==========================================================================

let planoPlanos = null;

$("ficheiro-planos").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  let dados;
  try { dados = JSON.parse(await f.text()); } catch { return toast("O ficheiro não é um JSON válido.", true); }
  if (dados.formato !== "adn-mensalidades-v1") return toast("Este ficheiro não é de planos de mensalidade do ADN Ensinar.", true);

  const [ra, rp] = await Promise.all([
    sb.from("alunos").select("id, nome, nome_comum, ano_escolar, ano_turma, ativo, servico"),
    sb.from("precos").select("id, nivel, servico, descricao"),
  ]);
  if (failed(ra.error, "Erro a ler alunos") || failed(rp.error, "Erro a ler preços (correu a migração 007?)")) return;

  const porNome = new Map(ra.data.map((a) => [norm(a.nome).trim().replace(/\s+/g, " "), a]));
  const linhas = dados.alunos.map((x) => {
    const aluno = porNome.get(norm(x.nome).trim().replace(/\s+/g, " ")) ?? associar(x.nome, ra.data);
    const preco = rp.data.find((p) => p.nivel === x.nivel && p.servico === x.categoria && p.descricao === x.descricao);
    return { ...x, aluno, preco };
  });
  planoPlanos = { dados, linhas };

  const ok = linhas.filter((l) => l.aluno);
  const aprox = linhas.filter((l) => !l.exato);
  $("resumo-planos").innerHTML =
    `<strong>${linhas.length}</strong> alunos no ficheiro, <strong>${ok.length}</strong> encontrados no site` +
    (linhas.length - ok.length ? ` — <strong>${linhas.length - ok.length}</strong> por encontrar (ficam de fora)` : "") +
    `. ${aprox.length} com valor diferente da tabela de preços (fica o valor real, com o plano mais próximo).`;
  $("linhas-planos").innerHTML = linhas.map((l) => `
    <tr>
      <td>${esc(l.nome)}</td>
      <td>${l.aluno ? esc(l.aluno.nome) : '<span class="badge badge--pink">Não encontrado</span>'}</td>
      <td class="small">${esc(l.categoria)} · ${esc(l.descricao)} <span class="muted">(${esc(l.nivel ?? "?")})</span></td>
      <td class="num">${euro(l.valor)}</td>
      <td>${l.exato ? "" : '<span class="badge badge--yellow">Valor próprio</span>'}</td>
    </tr>`).join("");
  $("preview-planos").hidden = false;
});

$("cancelar-planos").addEventListener("click", () => {
  planoPlanos = null;
  $("preview-planos").hidden = true;
  $("ficheiro-planos").value = "";
});

$("confirmar-planos").addEventListener("click", async () => {
  if (!planoPlanos) return;
  const btn = $("confirmar-planos");
  btn.disabled = true;
  btn.textContent = "A importar…";
  let feitos = 0;
  try {
    const { dados, linhas } = planoPlanos;
    for (const l of linhas.filter((x) => x.aluno)) {
      const a = l.aluno;
      const { error: e1 } = await sb.from("aluno_planos").delete().eq("aluno_id", a.id);
      if (failed(e1, `Erro nos planos de ${a.nome}`)) return;
      const { error: e2 } = await sb.from("aluno_planos").insert({
        aluno_id: a.id, preco_id: l.preco?.id ?? null, servico: l.categoria, descricao: l.descricao, valor: l.valor, desconto_pct: 0,
      });
      if (failed(e2, `Erro nos planos de ${a.nome}`)) return;
      const extra = { duodecimo_meses: dados.duodecimo_meses ?? 9, inscricao_valor: dados.inscricao_valor ?? 0 };
      if (!a.servico) extra.servico = l.categoria;
      const { error: e3 } = await sb.from("alunos").update(extra).eq("id", a.id);
      if (failed(e3, `Erro ao atualizar ${a.nome} (correu a migração 009?)`)) return;
      feitos++;
    }
    toast(`${feitos} planos importados.`);
    setTimeout(() => location.assign("mensalidades.html"), 1400);
  } finally {
    btn.disabled = false;
    btn.textContent = "Importar planos";
  }
});


// ==========================================================================
// Uniformizar fichas existentes
// ==========================================================================

const ROTULOS = {
  nome: "Nome", nome_comum: "Nome comum", nif: "NIF", data_nascimento: "Data de nascimento", morada: "Morada",
  codigo_postal: "Código postal", localidade: "Localidade", telemovel_aluno: "Telemóvel aluno", escola: "Escola",
  ano_turma: "Ano e turma", ano_escolar: "Ano", dificuldades: "Dificuldades", saude: "Saúde", como_conheceu: "Como conheceu",
  encarregado_nome: "Encarregado", encarregado_email: "Email EE", encarregado_telefone: "Telemóvel EE",
  encarregado_parentesco: "Parentesco", encarregado_profissao: "Profissão EE", email_institucional: "Email institucional",
  password_institucional: "Password institucional",
};
let planoUnif = [];

$("analisar-unif").addEventListener("click", async () => {
  const { data, error } = await sb.from("alunos").select("*");
  if (failed(error, "Erro a ler alunos")) return;
  planoUnif = data
    .map((a) => {
      const base = {};
      for (const k of Object.keys(ROTULOS)) if (k in a) base[k] = a[k];
      return { aluno: a, dif: INSC.diferencas(base) };
    })
    .filter((x) => Object.keys(x.dif).length);

  const nCampos = planoUnif.reduce((t, x) => t + Object.keys(x.dif).length, 0);
  $("resumo-unif").innerHTML = planoUnif.length
    ? `<strong>${nCampos}</strong> campos a corrigir em <strong>${planoUnif.length}</strong> de ${data.length} alunos.`
    : "Está tudo uniformizado. Nada a corrigir.";
  $("linhas-unif").innerHTML = planoUnif.flatMap(({ aluno, dif }) =>
    Object.entries(dif).map(([k, [antes, depois]], i) => `
      <tr>
        <td>${i === 0 ? `<strong>${esc(aluno.nome)}</strong>` : ""}</td>
        <td class="small">${esc(ROTULOS[k] ?? k)}</td>
        <td class="small muted">${k === "password_institucional" ? "••••" : esc(antes ?? "—")}</td>
        <td class="small"><strong>${k === "password_institucional" ? "•••• (espaços retirados)" : esc(depois ?? "—")}</strong></td>
      </tr>`)
  ).join("");
  $("aplicar-unif").hidden = !planoUnif.length;
  $("preview-unif").hidden = false;
});

$("cancelar-unif").addEventListener("click", () => { planoUnif = []; $("preview-unif").hidden = true; });

$("aplicar-unif").addEventListener("click", async () => {
  const btn = $("aplicar-unif");
  btn.disabled = true;
  btn.textContent = "A aplicar…";
  let ok = 0;
  try {
    for (const { aluno, dif } of planoUnif) {
      const alteracoes = Object.fromEntries(Object.entries(dif).map(([k, [, depois]]) => [k, depois]));
      const { error } = await sb.from("alunos").update(alteracoes).eq("id", aluno.id);
      if (failed(error, `Erro ao atualizar ${aluno.nome}`)) return;
      ok++;
    }
    toast(`${ok} fichas uniformizadas.`);
    $("preview-unif").hidden = true;
  } finally {
    btn.disabled = false;
    btn.textContent = "Aplicar alterações";
  }
});
