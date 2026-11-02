import {
  URL_EMAILS, nomeAluno, textoAluno, sb, requireAuth, esc, toast, failed, norm, formData, fillForm, wireModal,
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
  const [r1, r2, r4, r5] = await Promise.all([
    sb.from("alunos").select("*"),
    sb.from("aluno_planos").select("*"),
    sb.from("mensalidades").select("*").eq("mes", mes),
    sb.from("mensalidades").select("aluno_id, mes, inscricao").gte("mes", inicioAnoLetivo(mes)).lt("mes", mes),
  ]);
  if (
    failed(r1.error, "Erro a carregar alunos") || failed(r2.error, "Erro a carregar planos") ||
    failed(r4.error, "Erro a carregar mensalidades") ||
    failed(r5.error, "Erro a carregar mensalidades")
  ) return;

  alunos = r1.data;
  planos = new Map();
  for (const p of r2.data) {
    if (!planos.has(p.aluno_id)) planos.set(p.aluno_id, []);
    planos.get(p.aluno_id).push(p);
  }
  linhas = r4.data;
  doAnoLetivo = r5.data;
  render();
  carregarEnvios();
}

const alunoPorId = (id) => alunos.find((a) => a.id === id);
const descPlano = (alunoId) =>
  (planos.get(alunoId) ?? [])
    .map((p) => [p.servico, p.descricao].filter(Boolean).join(" · ") || "Valor manual")
    .join(" + ") +
  (Number(alunoPorId(alunoId)?.desconto_pct) ? ` (−${Number(alunoPorId(alunoId).desconto_pct)}%)` : "");

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
  fatura: (l) => (l.fatura_emitida ? 1 : 0),
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
  const ff = $("filter-fatura").value;
  const visiveis = ordenar(
    linhas.filter((l) =>
      (!q || norm(textoAluno(alunoPorId(l.aluno_id))).includes(q)) &&
      (!f || estadoVisivel(l) === f) &&
      (!ff || (ff === "sim") === !!l.fatura_emitida)),
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
        <td class="col-fatura"><input type="checkbox" class="chk-fatura" data-fatura="${l.id}" ${l.fatura_emitida ? "checked" : ""}
              title="${l.fatura_emitida ? "Fatura passada" : "Fatura por passar"}" aria-label="Fatura passada" /></td>
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
      <td colspan="4"></td>
    </tr>` : "";
}

$("search").addEventListener("input", render);
$("filter-estado").addEventListener("change", render);
$("filter-fatura").addEventListener("change", render);
ligarOrdenacao(document.querySelector("table.table"), $("ordem"), estadoOrdem, render);

// ---------- Gerar mensalidades do mês ----------

$("gerar").addEventListener("click", async () => {
  const mesNum = Number(mes.slice(5, 7));
  if ([6, 7, 8].includes(mesNum) &&
      !confirm(`Normalmente não há mensalidade em ${nomeMes(mes).split(" ")[0]} (junho é repartido em duodécimos; julho e agosto sem aulas).\n\nGerar mesmo assim?`)) return;

  const comLinha = new Set(linhas.map((l) => l.aluno_id));
  // A inscrição entra na 1.ª mensalidade do aluno neste ano letivo.
  const jaTemMensalidade = new Set(doAnoLetivo.map((l) => l.aluno_id));

  const novas = alunos
    .filter((a) => a.ativo && !comLinha.has(a.id) && (planos.get(a.id) ?? []).length)
    .map((a) => {
      const planosT = cent(planos.get(a.id).reduce((t, p) => t + Number(p.valor || 0), 0));
      const mensalidade = cent(planosT - planosT * Number(a.desconto_pct || 0) / 100);
      const meses = Number(a.duodecimo_meses || 0);
      const duodecimo = a.duodecimo_valor != null ? cent(a.duodecimo_valor) : meses > 0 ? cent(mensalidade / meses) : 0;
      const inscricao = jaTemMensalidade.has(a.id) ? 0 : cent(a.inscricao_valor || 0);
      return { aluno_id: a.id, mes, mensalidade, duodecimo, inscricao, estado: "Por pagar" };
    });
  if (!novas.length) return;

  const total = cent(novas.reduce((t, n) => t + n.mensalidade + n.duodecimo + n.inscricao, 0));
  const nInsc = novas.filter((n) => n.inscricao).length;
  if (!confirm(
    `Criar ${novas.length} mensalidade${novas.length > 1 ? "s" : ""} de ${nomeMes(mes)}?\n\n` +
    `Total previsto: ${euro(total)}` + (nInsc ? `\nInclui inscrição em ${nInsc} aluno${nInsc > 1 ? "s" : ""} (1.ª mensalidade do ano letivo).` : "") +
    `\n\nOs valores podem ser ajustados depois, em cada linha.`
  )) return;

  $("gerar").disabled = true;
  const { error } = await sb.from("mensalidades").insert(novas);
  if (failed(error, "Não foi possível gerar")) { $("gerar").disabled = false; return; }
  toast(`${novas.length} mensalidades criadas.`);
  carregar();
});

// ---------- Marcar como pago (rápido) ----------

// Pede sempre o método; a data de pagamento é a de hoje.
const modalPagar = $("modal-pagar");
const formPagar = $("form-pagar");
wireModal(modalPagar);
let pagarId = null;

function abrirPagar(l) {
  pagarId = l.id;
  formPagar.reset();
  const a = alunoPorId(l.aluno_id);
  $("pagar-resumo").innerHTML =
    `<strong>${esc(a ? nomeAluno(a) : "Mensalidade")}</strong> · ${esc(nomeMes(l.mes))}<br>` +
    `${euro(l.total)} · pago hoje, ${new Date().toLocaleDateString("pt-PT")}`;
  $("pagar-fatura").checked = !!l.fatura_emitida;
  $("pagar-ok").disabled = true;
  modalPagar.showModal();
}

$("pagar-metodos").addEventListener("change", () => { $("pagar-ok").disabled = false; });

formPagar.addEventListener("submit", async (e) => {
  e.preventDefault();
  const metodo = formPagar.querySelector('input[name="metodo"]:checked')?.value;
  if (!metodo) return toast("Escolhe o método de pagamento.", true);
  $("pagar-ok").disabled = true;
  const { error } = await sb.from("mensalidades")
    .update({
      estado: "Pago", pago_em: isoLocal(new Date()), valor_pago: null, metodo,
      // sem a migração 013 a coluna ainda não existe
      ...(linhas.some((x) => "fatura_emitida" in x) ? { fatura_emitida: $("pagar-fatura").checked } : {}),
    })
    .eq("id", pagarId);
  if (failed(error, "Não foi possível marcar como pago")) { $("pagar-ok").disabled = false; return; }
  modalPagar.close();
  toast(`Marcada como paga (${metodo}).`);
  carregar();
});

$("lista").addEventListener("change", async (e) => {
  const c = e.target.closest("[data-fatura]");
  if (!c) return;
  c.disabled = true;
  const { error } = await sb.from("mensalidades").update({ fatura_emitida: c.checked }).eq("id", c.dataset.fatura);
  c.disabled = false;
  if (failed(error, "Não foi possível guardar a fatura")) { c.checked = !c.checked; return; }
  const l = linhas.find((x) => x.id === c.dataset.fatura);
  if (l) l.fatura_emitida = c.checked;
  c.title = c.checked ? "Fatura passada" : "Fatura por passar";
  toast(c.checked ? "Fatura marcada como passada." : "Fatura marcada como por passar.");
});

$("lista").addEventListener("click", (e) => {
  if (e.target.closest("[data-fatura]")) return e.stopPropagation(); // só a caixa, não abre a ficha
  const b = e.target.closest("[data-pagar]");
  if (b) {
    e.stopPropagation();
    return abrirPagar(linhas.find((l) => l.id === b.dataset.pagar));
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
  if (!linhas.some((x) => "fatura_emitida" in x)) delete d.fatura_emitida; // migração 013 por correr
  d.valor_pago = d.estado === "Parcial" && d.valor_pago != null ? cent(d.valor_pago) : null;
  if (d.estado === "Por pagar" || d.estado === "Isento") { d.pago_em = null; d.metodo = null; }
  if (["Pago", "Parcial"].includes(d.estado)) {
    if (!d.metodo) { $("f-metodo").focus(); return toast("Escolhe o método de pagamento.", true); }
    if (!d.pago_em) d.pago_em = isoLocal(new Date());
  }

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


// ==========================================================================
// Emails de pagamento (dia 1 e dia 8) — enviados pela conta do ADN via Apps Script
// ==========================================================================

const modalEmail = $("modal-email");
wireModal(modalEmail);
let envios = [];
let tipoEmail = null;
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

const TIPOS_EMAIL = {
  inicio: {
    titulo: "Informação de pagamento",
    assunto: "Início do Período de Pagamento",
    explica: "Vai para <strong>todos os encarregados de educação</strong> dos alunos ativos: informa que começou o período de pagamento e que se estende até ao dia 8.",
  },
  ultimo: {
    titulo: "Lembrete de prazo",
    assunto: "Último Dia para Pagamento",
    explica: "Vai <strong>só para os encarregados dos alunos com a mensalidade por pagar</strong> (ou paga em parte) neste mês: relembra que hoje, dia 8, termina o prazo.",
  },
};

function emailsDe(lista) {
  const vistos = new Set();
  for (const a of lista) {
    for (const raw of String(a.encarregado_email ?? "").split(/[,;\s]+/)) {
      const e = raw.trim().toLowerCase();
      if (e && EMAIL_VALIDO.test(e) && !/\.con$/.test(e)) vistos.add(e);
    }
  }
  return [...vistos];
}

/** Quem recebe (pré-visualização; o envio real volta a calcular do lado do servidor). */
function alvoEmail(tipo) {
  if (tipo === "inicio") {
    const ativos = alunos.filter((a) => a.ativo);
    return { alunos: ativos, emails: emailsDe(ativos), semEmail: ativos.filter((a) => !emailsDe([a]).length) };
  }
  const ids = new Set(linhas.filter((l) => ["Por pagar", "Parcial"].includes(l.estado)).map((l) => l.aluno_id));
  const lista = alunos.filter((a) => ids.has(a.id));
  return { alunos: lista, emails: emailsDe(lista), semEmail: lista.filter((a) => !emailsDe([a]).length) };
}

async function carregarEnvios() {
  const { data, error } = await sb.from("envios_email").select("*").eq("mes", mes).order("enviado_em", { ascending: false });
  envios = error ? [] : data;
  for (const t of ["inicio", "ultimo"]) {
    const ult = envios.find((e) => e.tipo === t && !e.teste);
    $(`info-${t}`).textContent = ult
      ? `Enviado a ${new Date(ult.enviado_em).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${ult.destinatarios} emails`
      : `Ainda não enviado em ${nomeMes(mes).split(" ")[0]}`;
  }
}

function abrirEmail(tipo) {
  tipoEmail = tipo;
  const t = TIPOS_EMAIL[tipo];
  const alvo = alvoEmail(tipo);
  const ult = envios.find((e) => e.tipo === tipo && !e.teste);
  $("email-titulo").textContent = t.titulo;
  $("email-corpo").innerHTML = `
    <p style="margin-top:0">Assunto: <strong>📚 ADN Ensinar | ${t.assunto} - ${nomeMes(mes).replace(" de ", " ").replace(/^./, (c) => c.toUpperCase())}</strong></p>
    <p>${t.explica}</p>
    ${ult ? `<p class="alerta" style="margin:0 0 12px">Este email já foi enviado este mês, a ${new Date(ult.enviado_em).toLocaleString("pt-PT")}. Enviar outra vez?</p>` : ""}
    ${tipo === "ultimo" && !linhas.length ? `<p class="alerta" style="margin:0 0 12px">Ainda não há mensalidades geradas em ${nomeMes(mes)} — gera-as e marca as pagas antes de enviar o lembrete.</p>` : ""}
    <p><strong>${alvo.emails.length}</strong> ${alvo.emails.length === 1 ? "email" : "emails"} de encarregados
       (${alvo.alunos.length} ${alvo.alunos.length === 1 ? "aluno" : "alunos"}), enviados em BCC a partir de adnensinar@gmail.com.</p>
    ${tipo === "ultimo" && alvo.alunos.length ? `<details><summary class="small">Ver alunos com a mensalidade por pagar</summary>
      <p class="small">${alvo.alunos.map((a) => esc(nomeAluno(a))).sort((x, y) => x.localeCompare(y, "pt")).join(", ")}</p></details>` : ""}
    ${alvo.semEmail.length ? `<p class="small txt-danger">Sem email válido do encarregado (não recebem): ${alvo.semEmail.map((a) => esc(nomeAluno(a))).join(", ")}</p>` : ""}
    <p class="small muted">Dica: envia primeiro um teste para veres o email tal como os pais o vão receber.</p>`;
  $("email-enviar").textContent = `Enviar a ${alvo.emails.length}`;
  $("email-enviar").disabled = !alvo.emails.length;
  modalEmail.showModal();
}

async function enviarEmail(teste) {
  if (!URL_EMAILS) {
    return toast("O envio de emails ainda não está ligado: falta publicar o Apps Script (ver apps-script/README.md).", true);
  }
  const alvo = alvoEmail(tipoEmail);
  if (!teste && !confirm(`Confirmas o envio de "${TIPOS_EMAIL[tipoEmail].titulo}" para ${alvo.emails.length} encarregados de educação?`)) return;

  const botoes = [$("email-teste"), $("email-enviar")];
  botoes.forEach((b) => (b.disabled = true));
  const textoAntes = $("email-enviar").textContent;
  $(teste ? "email-teste" : "email-enviar").textContent = "A enviar…";
  try {
    const { data } = await sb.auth.getSession();
    const r = await fetch(URL_EMAILS, {
      method: "POST",
      body: JSON.stringify({ tipo: tipoEmail, mes, teste, token: data.session?.access_token }),
    });
    const res = await r.json();
    if (!res.ok) throw new Error(res.erro);
    toast(teste ? "Teste enviado para adnensinar@gmail.com." : `Enviado para ${res.enviados} encarregados.`);
    if (!teste) modalEmail.close();
    carregarEnvios();
  } catch (e) {
    toast(`Não foi possível enviar: ${e.message}`, true);
  } finally {
    botoes.forEach((b) => (b.disabled = false));
    $("email-teste").textContent = "Enviar teste para adnensinar@gmail.com";
    $("email-enviar").textContent = textoAntes;
  }
}

document.querySelectorAll("[data-email]").forEach((b) => b.addEventListener("click", () => abrirEmail(b.dataset.email)));
$("email-teste").addEventListener("click", () => enviarEmail(true));
$("email-enviar").addEventListener("click", () => enviarEmail(false));
