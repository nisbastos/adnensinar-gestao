import { textoAluno, nomeAluno, ordenar, ligarOrdenacao, sincronizar, euro, cent, nivelDoAno, sb, requireAuth, esc, toast, failed, norm, formData, fillForm, wireModal, ANOS, DIAS_CURTOS, hhmm } from "./app.js";

await requireAuth();

const $ = (id) => document.getElementById(id);
const lista = $("lista");
const modal = $("modal");
const form = $("form");
wireModal(modal);

$("f-ano").innerHTML = `<option value="">—</option>` + ANOS.map((a) => `<option>${a}</option>`).join("");

let alunos = [];
let aulasPorAluno = new Map(); // aluno_id → [{dia, inicio, fim, disciplina}]
let disciplinas = [];
let precos = [];
let planosPorAluno = new Map(); // aluno_id → [plano]
let discPorAluno = new Map(); // aluno_id → Set(disciplina_id)
let editId = null;
let verTodas = false;
const revelados = new Set();
const estadoOrdem = { chave: "nome", dir: "asc" };
const CHAVES = {
  nome: (a) => a.nome,
  ano: (a) => Number((a.ano_escolar ?? "").match(/\d+/)?.[0] ?? NaN) || null,
  tel: (a) => a.telemovel_aluno,
  ee: (a) => a.encarregado_nome,
  eetel: (a) => a.encarregado_telefone ?? a.encarregado_email,
  einst: (a) => a.email_institucional,
  saida: (a) => a.autoriza_saida,
  recente: (a) => a.data_inscricao ?? a.created_at,
};

async function carregar() {
  const [{ data: a, error: e1 }, { data: h, error: e2 }, { data: d, error: e3 }, { data: ad, error: e4 }, { data: pr, error: e5 }, { data: pl, error: e6 }] = await Promise.all([
    sb.from("alunos").select("*").order("nome"),
    sb.from("horario_alunos").select("aluno_id, horario(dia_semana, hora_inicio, hora_fim, categoria, disciplina:disciplinas(nome))"),
    sb.from("disciplinas").select("*").order("ordem").order("nome"),
    sb.from("aluno_disciplinas").select("aluno_id, disciplina_id"),
    sb.from("precos").select("*").order("ordem"),
    sb.from("aluno_planos").select("*").order("created_at"),
  ]);
  if (failed(e1, "Erro a carregar alunos") || failed(e2, "Erro a carregar horário") || failed(e3, "Erro a carregar disciplinas") || failed(e4, "Erro a carregar disciplinas dos alunos")) return;
  // As tabelas de mensalidades podem ainda não existir (migração 007); a página funciona na mesma.
  precos = e5 ? [] : pr;
  planosPorAluno = new Map();
  for (const p of e6 ? [] : pl) {
    if (!planosPorAluno.has(p.aluno_id)) planosPorAluno.set(p.aluno_id, []);
    planosPorAluno.get(p.aluno_id).push(p);
  }
  disciplinas = d;
  discPorAluno = new Map();
  for (const r of ad) {
    if (!discPorAluno.has(r.aluno_id)) discPorAluno.set(r.aluno_id, new Set());
    discPorAluno.get(r.aluno_id).add(r.disciplina_id);
  }
  alunos = a;
  aulasPorAluno = new Map();
  for (const r of h) {
    if (!r.horario) continue;
    if (!aulasPorAluno.has(r.aluno_id)) aulasPorAluno.set(r.aluno_id, []);
    aulasPorAluno.get(r.aluno_id).push(r.horario);
  }
  render();
}

const nomesDisc = (alunoId) =>
  disciplinas.filter((d) => discPorAluno.get(alunoId)?.has(d.id)).map((d) => d.nome).join(", ");


function render() {
  const q = norm($("search").value);
  const estado = $("filter-estado").value;
  const filtrados = alunos.filter((a) => {
    if (estado === "ativos" && !a.ativo) return false;
    if (estado === "inativos" && a.ativo) return false;
    if (!q) return true;
    return norm([textoAluno(a), a.escola, a.encarregado_nome, a.encarregado_email, nomesDisc(a.id), a.nif, a.localidade, a.ano_turma].join(" ")).includes(q);
  });

  $("contagem").textContent = `${filtrados.length} ${filtrados.length === 1 ? "aluno" : "alunos"}`;
  $("vazio").hidden = filtrados.length > 0;

  const vazio = `<span class="muted">—</span>`;
  lista.innerHTML = ordenar(filtrados, estadoOrdem, CHAVES)
    .map((a) => {
      const contactoEE = [a.encarregado_telefone, a.encarregado_email].filter(Boolean).map(esc).join("<br>");
      const ver = verTodas || revelados.has(a.id);
      const pw = a.password_institucional
        ? `<span class="pw-cell">${ver ? esc(a.password_institucional) : "••••••"}<button type="button" data-pw="${a.id}">${ver ? "esconder" : "ver"}</button></span>`
        : vazio;
      const saida = a.autoriza_saida == null ? vazio
        : a.autoriza_saida ? `<span class="badge badge--green">Sim</span>` : `<span class="badge badge--pink">Não</span>`;
      return `
        <tr data-id="${a.id}">
          <td class="col-nome"><strong>${esc(a.nome)}</strong>${a.nome_comum ? `<div class="small muted">“${esc(a.nome_comum)}”</div>` : ""}${a.ativo ? "" : ` <span class="badge badge--off">Inativo</span>`}</td>
          <td class="nowrap">${esc(a.ano_escolar) || vazio}</td>
          <td class="small">${esc(a.telemovel_aluno) || vazio}</td>
          <td>${esc(a.encarregado_nome) || vazio}</td>
          <td class="small">${contactoEE || vazio}</td>
          <td class="small">${esc(a.email_institucional) || vazio}</td>
          <td>${pw}</td>
          <td>${saida}</td>
        </tr>`;
    })
    .join("");
}

function abrir(aluno = null) {
  editId = aluno?.id ?? null;
  form.reset();
  fillForm(form, aluno ?? { ativo: true, duodecimo_meses: 9, desconto_pct: 0, inscricao_valor: 40 });
  const escolhidas = discPorAluno.get(aluno?.id) ?? new Set();
  $("f-disc").innerHTML = disciplinas
    .filter((d) => d.ativo || escolhidas.has(d.id))
    .map((d) => `<label class="chip"><input type="checkbox" data-multi="1" value="${d.id}" ${escolhidas.has(d.id) ? "checked" : ""} /><span>${esc(d.nome)}</span></label>`)
    .join("") || `<span class="muted small">Sem disciplinas — cria-as na página Disciplinas.</span>`;
  planosEdicao = (planosPorAluno.get(aluno?.id) ?? []).map((p) => ({ ...p }));
  atualizarMostra();
  renderPlanos();
  $("modal-title").textContent = aluno ? "Editar aluno" : "Novo aluno";
  $("f-pinst").type = "password";
  $("pw-toggle").textContent = "Mostrar";
  $("apagar").hidden = !aluno;

  const aulas = (aluno && aulasPorAluno.get(aluno.id)) || [];
  $("f-aulas").innerHTML = aulas.length
    ? "No horário: " +
      aulas
        .sort((x, y) => x.dia_semana - y.dia_semana || x.hora_inicio.localeCompare(y.hora_inicio))
        .map((h) => `${DIAS_CURTOS[h.dia_semana]} ${hhmm(h.hora_inicio)}–${hhmm(h.hora_fim)}${h.disciplina?.nome ? " (" + esc(h.disciplina.nome) + ")" : ""}`)
        .join(" · ")
    : aluno ? "Ainda não está em nenhuma aula do horário." : "";
  modal.showModal();
  $("f-nome").focus();
}

// ---------- Planos de mensalidade (na ficha) ----------

let planosEdicao = [];

function opcoesPreco(plano) {
  const nivel = nivelDoAno($("f-ano").value);
  const lista = precos.filter((p) => (p.ativo && (!nivel || p.nivel === nivel)) || p.id === plano.preco_id);
  const grupos = ["Apoio ao Estudo", "Explicação"].map((serv) => {
    const ops = lista.filter((p) => p.servico === serv);
    if (!ops.length) return "";
    return `<optgroup label="${serv}">${ops.map((p) =>
      `<option value="${p.id}" ${p.id === plano.preco_id ? "selected" : ""}>${esc(p.descricao)}${nivel ? "" : " · " + esc(p.nivel)} — ${euro(p.valor)}</option>`
    ).join("")}</optgroup>`;
  }).join("");
  return `<option value="">Valor manual…</option>${grupos}`;
}

/** Conta da mensalidade de um aluno: planos − desconto, + duodécimo, + inscrição no 1.º mês. */
function contaMensalidade(planos, meses, descontoPct, inscricao) {
  const planosT = cent(planos.reduce((t, p) => t + Number(p.valor || 0), 0));
  const desconto = cent(planosT * Number(descontoPct || 0) / 100);
  const mensalidade = cent(planosT - desconto);
  const duodecimo = Number(meses) > 0 ? cent(mensalidade / Number(meses)) : 0;
  return { planosT, desconto, mensalidade, duodecimo, mensal: cent(mensalidade + duodecimo), inscricao: cent(inscricao || 0) };
}

function renderPlanos() {
  if (!precos.length && !planosEdicao.length) {
    $("planos").innerHTML = `<p class="small muted">Para definir mensalidades, corre primeiro a migração 007 no Supabase.</p>`;
    $("plano-add").hidden = true;
    $("plano-resumo").innerHTML = "";
    return;
  }
  $("plano-add").hidden = false;
  $("planos").innerHTML = planosEdicao.map((p, i) => `
    <div class="plano" data-i="${i}">
      <div class="field plano__preco">
        <label>Plano</label>
        <select class="select" data-campo="preco_id">${opcoesPreco(p)}</select>
      </div>
      <div class="field plano__valor">
        <label>Valor (€)</label>
        <input class="input" type="number" min="0" step="0.01" data-campo="valor" value="${p.valor ?? ""}" />
      </div>
      <button type="button" class="btn btn--danger btn--sm plano__rem" data-rem="${i}" aria-label="Remover plano">×</button>
    </div>`).join("") || `<p class="small muted">Sem plano — este aluno não entra na geração de mensalidades.</p>`;
  renderConta();
}

function renderConta() {
  if (!planosEdicao.length) { $("plano-resumo").innerHTML = ""; return; }
  const meses = Number($("f-duo").value || 0);
  const descP = Number($("f-descp").value || 0);
  const c = contaMensalidade(planosEdicao, meses, descP, Number($("f-inscv").value || 0));
  const linha = (rot, val, cls = "") => `<div class="mens-conta__linha ${cls}"><span>${rot}</span><span>${val}</span></div>`;
  $("plano-resumo").innerHTML =
    linha(planosEdicao.length > 1 ? "Planos" : "Plano", euro(c.planosT)) +
    (c.desconto ? linha(`Desconto ${descP}%`, "− " + euro(c.desconto)) : "") +
    linha("Mensalidade", euro(c.mensalidade)) +
    (meses > 0 ? linha(`Duodécimo (${euro(c.mensalidade)} ÷ ${meses})`, "+ " + euro(c.duodecimo)) : "") +
    linha("Total por mês", euro(c.mensal), "is-total") +
    (c.inscricao ? linha("1.º mês do ano letivo (+ inscrição " + euro(c.inscricao) + ")", euro(c.mensal + c.inscricao), "is-sub") : "");
}

["f-duo", "f-descp", "f-inscv"].forEach((id) => $(id).addEventListener("input", renderConta));

$("planos").addEventListener("change", (e) => {
  const linha = e.target.closest(".plano");
  if (!linha) return;
  const p = planosEdicao[Number(linha.dataset.i)];
  const campo = e.target.dataset.campo;
  if (campo === "preco_id") {
    p.preco_id = e.target.value || null;
    const preco = precos.find((x) => x.id === p.preco_id);
    if (preco) Object.assign(p, { valor: Number(preco.valor), servico: preco.servico, descricao: preco.descricao });
    else Object.assign(p, { servico: null, descricao: null });
  } else {
    p[campo] = e.target.value === "" ? null : Number(e.target.value);
  }
  renderPlanos();
});

$("planos").addEventListener("click", (e) => {
  const b = e.target.closest("[data-rem]");
  if (!b) return;
  planosEdicao.splice(Number(b.dataset.rem), 1);
  renderPlanos();
});

$("plano-add").addEventListener("click", () => {
  planosEdicao.push({ preco_id: null, valor: null });
  renderPlanos();
});

// Pré-visualização do nome que aparece no resto do site.
const atualizarMostra = () => {
  $("f-mostra").textContent = nomeAluno({ nome: $("f-nome").value, nome_comum: $("f-comum").value }) || "—";
};
$("f-nome").addEventListener("input", atualizarMostra);
$("f-comum").addEventListener("input", atualizarMostra);

// O nível (ciclo) depende do ano escolar: ao mudar o ano, as opções de preço mudam.
$("f-ano").addEventListener("change", renderPlanos);

async function guardarPlanos(alunoId) {
  // Linhas deixadas em branco (sem plano nem valor) são ignoradas.
  planosEdicao = planosEdicao.filter((p) => p.preco_id || Number(p.valor) > 0);
  const antes = planosPorAluno.get(alunoId) ?? [];
  const ficam = new Set(planosEdicao.filter((p) => p.id).map((p) => p.id));
  const apagar = antes.filter((p) => !ficam.has(p.id)).map((p) => p.id);
  if (apagar.length) {
    const { error } = await sb.from("aluno_planos").delete().in("id", apagar);
    if (error) return error;
  }
  for (const p of planosEdicao) {
    const linha = {
      aluno_id: alunoId,
      preco_id: p.preco_id ?? null,
      servico: p.servico ?? null,
      descricao: p.descricao ?? null,
      valor: Number(p.valor || 0),
      desconto_pct: 0,
    };
    if (p.id) {
      const orig = antes.find((x) => x.id === p.id);
      const igual = orig && ["preco_id", "servico", "descricao"].every((k) => (orig[k] ?? null) === linha[k])
        && Number(orig.valor) === linha.valor && Number(orig.desconto_pct) === linha.desconto_pct;
      if (igual) continue;
      const { error } = await sb.from("aluno_planos").update(linha).eq("id", p.id);
      if (error) return error;
    } else {
      const { error } = await sb.from("aluno_planos").insert(linha);
      if (error) return error;
    }
  }
  return null;
}

lista.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-pw]");
  if (b) {
    e.stopPropagation();
    revelados.has(b.dataset.pw) ? revelados.delete(b.dataset.pw) : revelados.add(b.dataset.pw);
    return render();
  }
  const tr = e.target.closest("tr[data-id]");
  if (tr) abrir(alunos.find((a) => a.id === tr.dataset.id));
});

$("pw-toggle").addEventListener("click", () => {
  const i = $("f-pinst");
  i.type = i.type === "password" ? "text" : "password";
  $("pw-toggle").textContent = i.type === "password" ? "Mostrar" : "Esconder";
});

$("pw-todas").addEventListener("click", (e) => {
  e.stopPropagation();
  verTodas = !verTodas;
  revelados.clear();
  $("pw-todas").textContent = verTodas ? "esconder todas" : "ver todas";
  render();
});

ligarOrdenacao(document.querySelector("table.table"), $("ordem"), estadoOrdem, render);

$("novo").addEventListener("click", () => abrir());
$("search").addEventListener("input", render);
$("filter-estado").addEventListener("change", render);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const dados = formData(form);
  if (!dados.nome) return toast("O nome é obrigatório.", true);

  const discIds = [...$("f-disc").querySelectorAll("input:checked")].map((i) => i.value);

  $("guardar").disabled = true;
  try {
    let id = editId;
    if (id) {
      const { error } = await sb.from("alunos").update(dados).eq("id", id);
      if (failed(error, "Não foi possível guardar")) return;
    } else {
      const { data, error } = await sb.from("alunos").insert(dados).select("id").single();
      if (failed(error, "Não foi possível guardar")) return;
      id = data.id;
    }
    const e3 = await sincronizar("aluno_disciplinas", "aluno_id", id, "disciplina_id", discIds);
    if (failed(e3, "O aluno foi guardado, mas houve um erro nas disciplinas")) return;
    const e4 = await guardarPlanos(id);
    if (failed(e4, "O aluno foi guardado, mas houve um erro no plano de mensalidade")) return;
  } finally {
    $("guardar").disabled = false;
  }

  modal.close();
  toast(editId ? "Aluno atualizado." : "Aluno criado.");
  carregar();
});

$("apagar").addEventListener("click", async () => {
  const a = alunos.find((x) => x.id === editId);
  if (!confirm(`Apagar "${a.nome}" de vez?\n\nSe o aluno apenas saiu, é preferível desmarcar "Aluno ativo".`)) return;
  const { error } = await sb.from("alunos").delete().eq("id", editId);
  if (failed(error, "Não foi possível apagar")) return;
  modal.close();
  toast("Aluno apagado.");
  carregar();
});

carregar();
