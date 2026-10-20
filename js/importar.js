import { sb, requireAuth, esc, toast, failed, norm, ANOS } from "./app.js";

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
