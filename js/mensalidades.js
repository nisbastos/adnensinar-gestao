import {
  nomeAluno, textoAluno, sb, requireAuth, esc, toast, failed, norm, formData, fillForm, wireModal,
  ordenar, ligarOrdenacao, euro, cent, inicioMes, isoLocal, nomeMes, anoLetivo,
} from "./app.js";

await requireAuth();

const $ = (id) => document.getElementById(id);
const modal = $("modal");
const form = $("form");
wireModal(modal);

// Dia do mês a partir do qual uma mensalidade por pagar fica "em atraso".
const DIA_LIMITE = 8;

let mes = inicioMes(new Date()); // "AAAA-MM-01"
let alunos = [];
let planos = new Map();       // aluno_id → [plano]
let definicoes = {};
let linhas = [];              // mensalidades do mês
let doAnoLetivo = [];         // mensalidades do ano letivo (para saber quem já pagou inscrição)
let editId = null;

// ---------- Mês ----------

function mudarMes(delta) {
  const [a, m] = mes.split("-").map(Number);
  mes = inicioMes(new Date(a, m - 1 + delta, 1));
  $("mes").value = mes.slice(0, 7);
  carregar();
}
$("mes").value = mes.slice(0, 7);
$("mes").addEventListener("change", () => {
  if (!$("mes").value) return;
  mes = `${$("mes").value}-01`;
  carregar();
});
$("mes-ant").addEventListener("click", () => mudarMes(-1));
$("mes-seg").addEventListener("click", () => mudarMes(1));

// ---------- Dados ----------

/** Primeiro mês (setembro) do ano letivo de um mês. */
const inicioAnoLetivo = (iso) => `${anoLetivo(iso).slice(0, 4)}-09-01`;

async function carregar() {
  const [r1, r2, r3, r4, r5] = await Promise.all([
    sb.from("alunos").select("id, nome, nome_comum, ano_escolar, ativo, data_inscricao"),
    sb.from("aluno_planos").select("*"),
    sb.from("definicoes").select("chave, valor"),
    sb.from("mensalidades").select("*").eq("mes", mes),
    sb.from("mensalidades").select("aluno_id, mes, inscricao").gte("mes", inicioAnoLetivo(mes)).lt("mes", mes),
  ]);
  if (
    failed(r1.error, "Erro a carregar alunos") || failed(r2.error, "Erro a carregar planos") ||
    failed(r3.error, "Erro a carregar definições") || failed(r4.error, "Erro a carregar mensalidades") ||
    failed(r5.error, "Erro a carregar mensalidades")
  ) return;

  alunos = r1.data;
  planos = new Map();
  for (const p of r2.data) {
    if (!planos.has(p.aluno_id)) planos.set(p.aluno_id, []);
    planos.get(p.aluno_id).push(p);
  }
  definicoes = Object.fromEntries(r3.data.map((x) => [x.chave, Number(x.valor)]));
  linhas = r4.data;
  doAnoLetivo = r5.data;
  render();
}

const alunoPorId = (id) => alunos.find((a) => a.id === id);
const descPlano = (alunoId) =>
  (planos.get(alunoId) ?? [])
    .map((p) => [p.servico, p.descricao].filter(Boolean).join(" · ") + (Number(p.desconto_pct) ? ` (−${Number(p.desconto_pct)}%)` : ""))
    .filter(Boolean).join(" + ");

/** Estado mostrado: "Por pagar" passa a "Em atraso" depois do dia limite. */
function estadoVisivel(l) {
  if (l.estado !== "Por pagar") return l.estado;
  const limite = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, DIA_LIMITE, 23, 59);
  return new Date() > limite ? "Em atraso" : "Por pagar";
}

const recebido = (l) =>
  l.estado === "Pago" ? Number(l.total) : l.estado === "Parcial" ? Number(l.valor_pago ?? 0) : 0;

// ---------- Ordenação ----------

const estadoOrdem = { chave: "aluno", dir: "asc" };
const ORDEM_ESTADOS = { "Em atraso": 0, "Por pagar": 1, Parcial: 2, Pago: 3, Isento: 4 };
const CHAVES = {
  aluno: (l) => nomeAluno(alunoPorId(l.aluno_id)),
  plano: (l) => descPlano(l.aluno_id),
  mensalidade: (l) => Number(l.mensalidade),
  duodecimo: (l) => Number(l.duodecimo),
  inscricao: (l) => Number(l.inscricao),
  total: (l) => Number(l.total),
  estado: (l) => ORDEM_ESTADOS[estadoVisivel(l)],
  pago: (l) => l.pago_em,
};

// ---------- Render ----------

const BADGE = {
  "Por pagar": "badge--yellow", "Em atraso": "badge--pink", Parcial: "badge--yellow",
  Pago: "badge--green", Isento: "badge--off",
};

function render() {
  // Resumo
  const contam = linhas.filter((l) => l.estado !== "Isento");
  const previsto = cent(contam.reduce((t, l) => t + Number(l.total), 0));
  const recebidoT = cent(contam.reduce((t, l) => t + recebido(l), 0));
  const porPagar = contam.filter((l) => l.estado !== "Pago");
  const atraso = linhas.filter((l) => estadoVisivel(l) === "Em atraso").length;
  $("stats").innerHTML = `
    <div class="stat card"><span class="stat__label">Previsto</span><span class="stat__num">${euro(previsto)}</span><span class="stat__sub">${contam.length} mensalidades</span></div>
    <div class="stat card"><span class="stat__label">Recebido</span><span class="stat__num">${euro(recebidoT)}</span><span class="stat__sub">${previsto ? Math.round((recebidoT / previsto) * 100) : 0}% do previsto</span></div>
    <div class="stat card"><span class="stat__label">Por receber</span><span class="stat__num">${euro(previsto - recebidoT)}</span><span class="stat__sub">${porPagar.length} por pagar${atraso ? ` · <strong class="txt-danger">${atraso} em atraso</strong>` : ""}</span></div>`;

  // Avisos sobre alunos ainda fora do mês
  const comLinha = new Set(linhas.map((l) => l.aluno_id));
  const ativos = alunos.filter((a) => a.ativo);
  const porGerar = ativos.filter((a) => !comLinha.has(a.id) && (planos.get(a.id) ?? []).length);
  const semPlano = ativos.filter((a) => !(planos.get(a.id) ?? []).length);
  $("aviso").innerHTML = [
    porGerar.length ? `${porGerar.length} ${porGerar.length === 1 ? "aluno ativo ainda não tem" : "alunos ativos ainda não têm"} mensalidade em ${nomeMes(mes)}.` : "",
    semPlano.length ? `${semPlano.length} ${semPlano.length === 1 ? "aluno ativo não tem" : "alunos ativos não têm"} plano definido (na ficha do aluno, secção Mensalidade).` : "",
  ].filter(Boolean).join(" ");
  $("gerar").disabled = !porGerar.length;
  $("gerar").textContent = porGerar.length ? `Gerar ${porGerar.length} mensalidade${porGerar.length > 1 ? "s" : ""}` : "Mês completo";

  // Tabela
  const q = norm($("search").value);
  const f = $("filter-estado").value;
  const visiveis = ordenar(
    linhas.filter((l) => (!q || norm(textoAluno(alunoPorId(l.aluno_id))).includes(q)) && (!f || estadoVisivel(l) === f)),
    estadoOrdem, CHAVES
  );

  $("vazio").hidden = visiveis.length > 0;
  $("vazio").textContent = linhas.length
    ? "Nenhuma mensalidade corresponde aos filtros."
    : `Ainda não há mensalidades em ${nomeMes(mes)}. Usa "Gerar" para as criar a partir dos planos dos alunos.`;

  const vazio = '<span class="muted">—</span>';
  const fmtData = (d) => (d ? d.split("-").reverse().join("/") : vazio);
  $("lista").innerHTML = visiveis.map((l) => {
    const a = alunoPorId(l.aluno_id);
    const est = estadoVisivel(l);
    return `
      <tr data-id="${l.id}">
        <td class="col-nome"><strong>${esc(a ? nomeAluno(a) : "(aluno apagado)")}</strong>${a && !a.ativo ? ' <span class="badge badge--off">Inativo</span>' : ""}</td>
        <td class="small">${esc(descPlano(l.aluno_id)) || vazio}</td>
        <td class="num">${euro(l.mensalidade)}</td>
        <td class="num">${euro(l.duodecimo)}</td>
        <td class="num">${Number(l.inscricao) ? euro(l.inscricao) : vazio}</td>
        <td class="num"><strong>${euro(l.total)}</strong></td>
        <td><span class="badge ${BADGE[est]}">${est}</span>${l.estado === "Parcial" ? `<div class="small muted">${euro(l.valor_pago)}</div>` : ""}</td>
        <td class="small">${fmtData(l.pago_em)}${l.metodo ? `<div class="muted">${esc(l.metodo)}</div>` : ""}</td>
        <td>${["Por pagar", "Parcial"].includes(l.estado) ? `<button type="button" class="btn btn--ghost btn--sm" data-pagar="${l.id}">Pago</button>` : ""}</td>
      </tr>`;
  }).join("");

  const soma = (k) => euro(visiveis.reduce((t, l) => t + Number(l[k]), 0));
  $("totais").innerHTML = visiveis.length ? `
    <tr>
      <td colspan="2"><strong>Total</strong> <span class="muted small">(${visiveis.length})</span></td>
      <td class="num">${soma("mensalidade")}</td>
      <td class="num">${soma("duodecimo")}</td>
      <td class="num">${soma("inscricao")}</td>
      <td class="num"><strong>${soma("total")}</strong></td>
      <td colspan="3"></td>
    </tr>` : "";
}

$("search").addEventListener("input", render);
$("filter-estado").addEventListener("change", render);
ligarOrdenacao(document.querySelector("table.table"), $("ordem"), estadoOrdem, render);

// ---------- Gerar mensalidades do mês ----------

/** Mês em que a inscrição é cobrada: o mês da inscrição, ou setembro se se inscreveu antes do início do ano letivo. */
function mesInscricao(aluno) {
  if (!aluno.data_inscricao) return null;
  const m = inicioMes(new Date(aluno.data_inscricao));
  const inicio = inicioAnoLetivo(mes);
  // Inscrições feitas até 6 meses antes de setembro contam para este ano letivo.
  const [a] = inicio.split("-").map(Number);
  if (m < inicio && m >= `${a}-03-01`) return inicio;
  return m;
}

$("gerar").addEventListener("click", async () => {
  const mesNum = Number(mes.slice(5, 7));
  if ([6, 7, 8].includes(mesNum) &&
      !confirm(`Normalmente não há mensalidade em ${nomeMes(mes).split(" ")[0]} (junho é repartido em duodécimos; julho e agosto sem aulas).\n\nGerar mesmo assim?`)) return;

  const comLinha = new Set(linhas.map((l) => l.aluno_id));
  const jaPagouInscricao = new Set(doAnoLetivo.filter((l) => Number(l.inscricao) > 0).map((l) => l.aluno_id));
  const meses = definicoes.meses_duodecimo || 9;
  const valorInscricao = cent((definicoes.valor_inscricao ?? 40) + (definicoes.valor_seguro ?? 0));

  const novas = alunos
    .filter((a) => a.ativo && !comLinha.has(a.id) && (planos.get(a.id) ?? []).length)
    .map((a) => {
      const base = cent(planos.get(a.id).reduce((t, p) => t + Number(p.valor) * (1 - Number(p.desconto_pct) / 100), 0));
      const inscricao = !jaPagouInscricao.has(a.id) && mesInscricao(a) === mes ? valorInscricao : 0;
      return { aluno_id: a.id, mes, mensalidade: base, duodecimo: cent(base / meses), inscricao, estado: "Por pagar" };
    });
  if (!novas.length) return;

  const total = cent(novas.reduce((t, n) => t + n.mensalidade + n.duodecimo + n.inscricao, 0));
  const nInsc = novas.filter((n) => n.inscricao).length;
  if (!confirm(
    `Criar ${novas.length} mensalidade${novas.length > 1 ? "s" : ""} de ${nomeMes(mes)}?\n\n` +
    `Total previsto: ${euro(total)}` + (nInsc ? `\nInclui inscrição em ${nInsc} aluno${nInsc > 1 ? "s" : ""} (inscritos este mês).` : "") +
    `\n\nOs valores podem ser ajustados depois, em cada linha.`
  )) return;

  $("gerar").disabled = true;
  const { error } = await sb.from("mensalidades").insert(novas);
  if (failed(error, "Não foi possível gerar")) { $("gerar").disabled = false; return; }
  toast(`${novas.length} mensalidades criadas.`);
  carregar();
});

// ---------- Marcar como pago (rápido) ----------

$("lista").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-pagar]");
  if (b) {
    e.stopPropagation();
    b.disabled = true;
    const { error } = await sb.from("mensalidades")
      .update({ estado: "Pago", pago_em: isoLocal(new Date()), valor_pago: null })
      .eq("id", b.dataset.pagar);
    if (failed(error, "Não foi possível marcar como pago")) { b.disabled = false; return; }
    toast("Marcada como paga.");
    return carregar();
  }
  const tr = e.target.closest("tr[data-id]");
  if (tr) abrir(linhas.find((l) => l.id === tr.dataset.id));
});

// ---------- Editar ----------

function atualizarTotal() {
  const t = ["f-mens", "f-duo", "f-insc"].reduce((s, id) => s + Number($(id).value || 0), 0);
  $("f-total").textContent = euro(t);
  $("campo-pago").hidden = $("f-estado").value !== "Parcial";
}

function abrir(l) {
  editId = l.id;
  form.reset();
  fillForm(form, l);
  $("modal-title").textContent = nomeAluno(alunoPorId(l.aluno_id)) || "Mensalidade";
  $("modal-sub").textContent = `${nomeMes(l.mes)}${descPlano(l.aluno_id) ? " · " + descPlano(l.aluno_id) : ""}`;
  atualizarTotal();
  modal.showModal();
}

["f-mens", "f-duo", "f-insc"].forEach((id) => $(id).addEventListener("input", atualizarTotal));
$("f-estado").addEventListener("change", () => {
  if (["Pago", "Parcial"].includes($("f-estado").value) && !$("f-data").value) $("f-data").value = isoLocal(new Date());
  atualizarTotal();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const d = formData(form);
  for (const k of ["mensalidade", "duodecimo", "inscricao"]) d[k] = cent(d[k] ?? 0);
  d.valor_pago = d.estado === "Parcial" && d.valor_pago != null ? cent(d.valor_pago) : null;
  if (d.estado === "Por pagar" || d.estado === "Isento") { d.pago_em = null; d.metodo = null; }

  $("guardar").disabled = true;
  const { error } = await sb.from("mensalidades").update(d).eq("id", editId);
  $("guardar").disabled = false;
  if (failed(error, "Não foi possível guardar")) return;
  modal.close();
  toast("Guardado.");
  carregar();
});

$("apagar").addEventListener("click", async () => {
  if (!confirm("Apagar esta mensalidade?\n\nPodes voltar a gerá-la depois a partir do plano do aluno.")) return;
  const { error } = await sb.from("mensalidades").delete().eq("id", editId);
  if (failed(error, "Não foi possível apagar")) return;
  modal.close();
  toast("Mensalidade apagada.");
  carregar();
});

carregar();
