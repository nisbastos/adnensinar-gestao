import { sb, requireAuth, esc, toast, failed, norm, ANOS, DIAS_CURTOS, CORES } from "./app.js";

await requireAuth();

const $ = (id) => document.getElementById(id);

// Cabeçalho do formulário (início do texto, sem acentos/maiúsculas) → coluna na base de dados.
const MAPA = [
  ["carimbo de data", "data_inscricao", dataHora],
  ["nome completo do aluno", "nome"],
  ["nif", "nif", soDigitos],
  ["data de nascimento", "data_nascimento", data],
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

// ---------- Conversores ----------

function data(v) {
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

function dataHora(v) {
  const d = data(v);
  if (!d) return null;
  const t = String(v).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return t ? `${d}T${t[1].padStart(2, "0")}:${t[2]}:${t[3] ?? "00"}` : d;
}

function simNao(v) {
  const n = norm(v).trim();
  if (!n) return null;
  return !n.startsWith("nao");
}

function soDigitos(v) {
  const d = String(v).replace(/\D/g, "");
  return d || null;
}

/** "7.º B", "7B", "7º ano turma B" → "7.º ano" */
function anoEscolar(t) {
  const m = String(t ?? "").match(/\d{1,2}/);
  if (!m) return null;
  const ano = `${Number(m[0])}.º ano`;
  return ANOS.includes(ano) ? ano : null;
}

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

  const cab = linhas[0].map((h) => norm(h).trim());
  const colunas = cab.map((h) => MAPA.find(([inicio]) => h.startsWith(inicio)) ?? null);
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
    const dados = {};
    colunas.forEach((c, i) => {
      if (!c) return;
      const [, campo, conv] = c;
      const bruto = (l[i] ?? "").trim();
      dados[campo] = bruto === "" ? null : conv ? conv(bruto) : bruto;
    });
    if (!dados.nome) continue;
    dados.ano_escolar = anoEscolar(dados.ano_turma);
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

  const candidatos = lista.filter((a) => {
    const w = norm(a.nome).split(/\s+/);
    if (!encaixa(palavras[0], w[0])) return false;
    let i = 1;
    for (const t of palavras.slice(1)) {
      while (i < w.length && !encaixa(t, w[i])) i++;
      if (i >= w.length) return false;
      i++;
    }
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
    sb.from("alunos").select("id, nome, ano_escolar, ano_turma, ativo"),
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
