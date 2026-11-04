import {
  sb, requireAuth, esc, toast, failed, norm, formData, fillForm, wireModal,
  nomeAluno, textoAluno, chaveTurma, rotuloTurma, isoLocal, MESES,
} from "./app.js";

await requireAuth();

const $ = (id) => document.getElementById(id);
const modal = $("modal");
const form = $("form");
wireModal(modal);

export const TIPOS = ["Teste", "Questão de Aula", "Ficha", "Trabalho", "Apresentação", "Entrega", "Oral", "Outro"];
const COR = {
  Teste: "#fbd1c1", "Questão de Aula": "#f7c6d3", Ficha: "#ffe7a9", Trabalho: "#cee3d1", "Apresentação": "#d9d2ec",
  Entrega: "#d6e4f5", Oral: "#c1dbdc", Outro: "#e6e6e6",
};
const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

let alunos = [], disciplinas = [], eventos = [];
let turmas = new Map();      // chave → [alunos ativos]
let alunoFiltro = null;      // aluno selecionado na pesquisa
let editId = null;
let alunoModal = null;

const hoje0 = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
let mesVisto = new Date(hoje0().getFullYear(), hoje0().getMonth(), 1);

$("m-tipo").innerHTML = TIPOS.map((t) => `<option>${t}</option>`).join("");
$("f-tipo-filtro").innerHTML = `<option value="">Todos os tipos</option>` + TIPOS.map((t) => `<option>${t}</option>`).join("");
$("legenda").innerHTML = TIPOS.map((t) => `<span><i style="background:${COR[t]}"></i>${t}</span>`).join("");

// ---------- Dados ----------

async function carregar() {
  const [r1, r2, r3] = await Promise.all([
    sb.from("alunos").select("id, nome, nome_comum, escola, ano_turma, ano_escolar, ativo"),
    sb.from("disciplinas").select("id, nome, ativo, ordem").order("ordem").order("nome"),
    sb.from("avaliacoes").select("*").order("data"),
  ]);
  if (failed(r1.error, "Erro a carregar alunos") || failed(r2.error, "Erro a carregar disciplinas") ||
      failed(r3.error, "Erro a carregar o calendário (correu a migração 011?)")) return;

  alunos = r1.data.sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
  disciplinas = r2.data;
  eventos = r3.data.sort((a, b) => a.data.localeCompare(b.data));

  turmas = new Map();
  for (const a of alunos.filter((x) => x.ativo)) {
    const k = chaveTurma(a);
    if (!k) continue;
    if (!turmas.has(k)) turmas.set(k, []);
    turmas.get(k).push(a);
  }

  $("lista-alunos").innerHTML = alunos.filter((a) => a.ativo)
    .map((a) => `<option value="${esc(a.nome)}">${esc(nomeAluno(a))}${a.ano_turma ? " · " + esc(a.ano_turma) : ""}</option>`).join("");

  const atualD = $("f-disc-filtro").value;
  $("f-disc-filtro").innerHTML = `<option value="">Todas as disciplinas</option>` +
    disciplinas.map((d) => `<option value="${d.id}">${esc(d.nome)}</option>`).join("");
  $("f-disc-filtro").value = atualD;
  $("m-disc").innerHTML = `<option value="">—</option>` +
    disciplinas.filter((d) => d.ativo).map((d) => `<option value="${d.id}">${esc(d.nome)}</option>`).join("");

  render();
}

const alunoPorId = (id) => alunos.find((a) => a.id === id);
const discPorId = (id) => disciplinas.find((d) => d.id === id);
const alunoPorTexto = (txt) => {
  const n = norm(txt).trim();
  if (!n) return null;
  return alunos.find((a) => norm(a.nome).trim() === n) ??
    (() => { const m = alunos.filter((a) => a.ativo && norm(textoAluno(a)).includes(n)); return m.length === 1 ? m[0] : null; })();
};

/** Colegas da mesma turma (ativos), incluindo o próprio. */
function turmaDe(aluno) {
  const k = chaveTurma(aluno);
  return (k && turmas.get(k)) || [aluno];
}

/** Alunos abrangidos por um evento. */
function abrangidos(e) {
  const a = alunoPorId(e.aluno_id);
  if (!a) return [];
  return e.aplica_turma ? turmaDe(a) : [a];
}

function filtrados() {
  const d = $("f-disc-filtro").value, t = $("f-tipo-filtro").value;
  return eventos.filter((e) =>
    (!d || e.disciplina_id === d) && (!t || e.tipo === t) &&
    (!alunoFiltro || abrangidos(e).some((a) => a.id === alunoFiltro.id)));
}

// ---------- Render ----------

const dataISO = (d) => isoLocal(d);
const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

function nomesEvento(e) {
  const lista = abrangidos(e);
  const reg = alunoPorId(e.aluno_id);
  if (alunoFiltro) return nomeAluno(alunoFiltro);
  const outros = lista.length - 1;
  return nomeAluno(reg) + (outros > 0 ? ` +${outros}` : "");
}

function chip(e) {
  const disc = discPorId(e.disciplina_id)?.nome ?? "";
  const titulo = [disc, e.tipo].filter(Boolean).join(" · ");
  const quem = abrangidos(e).map(nomeAluno).join(", ");
  return `
    <button type="button" class="cal-chip" data-id="${e.id}" style="background:${COR[e.tipo] ?? COR.Outro}"
            title="${esc(titulo)} — ${esc(quem)}${e.notas ? " — " + esc(e.notas) : ""}">
      <strong>${esc(titulo)}</strong>
      <span>${esc(nomesEvento(e))}</span>
    </button>`;
}

function render() {
  renderFiltroInfo();
  renderGrelha();
  renderProximos();
}

function renderFiltroInfo() {
  const el = $("filtro-info");
  if (!alunoFiltro) { el.hidden = true; return; }
  const colegas = turmaDe(alunoFiltro).filter((a) => a.id !== alunoFiltro.id);
  el.hidden = false;
  el.innerHTML = `A mostrar o calendário de <strong>${esc(nomeAluno(alunoFiltro))}</strong>` +
    (chaveTurma(alunoFiltro)
      ? ` e da turma ${esc(rotuloTurma(alunoFiltro))}${colegas.length ? ` <span class="muted">(com ${colegas.map((c) => esc(nomeAluno(c))).join(", ")})</span>` : ""}`
      : ` <span class="muted">(sem escola/turma na ficha — só os registos dele)</span>`) +
    ` <button type="button" class="link-btn" id="limpar-filtro">limpar</button>`;
  $("limpar-filtro").addEventListener("click", () => {
    alunoFiltro = null;
    $("f-aluno-busca").value = "";
    render();
  });
}

function renderGrelha() {
  $("mes-titulo").textContent = `${MESES[mesVisto.getMonth()]} ${mesVisto.getFullYear()}`;
  const inicio = new Date(mesVisto);
  inicio.setDate(1 - ((inicio.getDay() + 6) % 7)); // segunda-feira da 1.ª semana
  const fimMes = new Date(mesVisto.getFullYear(), mesVisto.getMonth() + 1, 0);
  const fim = new Date(fimMes);
  fim.setDate(fimMes.getDate() + (6 - ((fimMes.getDay() + 6) % 7)));

  const porDia = new Map();
  for (const e of filtrados()) {
    if (!porDia.has(e.data)) porDia.set(e.data, []);
    porDia.get(e.data).push(e);
  }

  const hoje = dataISO(hoje0());
  let html = DIAS_SEMANA.map((d, i) => `<div class="cal__dow ${i > 4 ? "is-fds" : ""}">${d}</div>`).join("");
  for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
    const iso = dataISO(d);
    const lista = porDia.get(iso) ?? [];
    const fora = d.getMonth() !== mesVisto.getMonth();
    const fds = d.getDay() === 0 || d.getDay() === 6;
    const MAX = 4;
    html += `
      <div class="cal__dia ${fora ? "is-fora" : ""} ${fds ? "is-fds" : ""} ${iso === hoje ? "is-hoje" : ""}" data-data="${iso}">
        <span class="cal__num">${d.getDate()}</span>
        ${lista.slice(0, MAX).map(chip).join("")}
        ${lista.length > MAX ? `<button type="button" class="cal-mais" data-dia="${iso}">+${lista.length - MAX} mais</button>` : ""}
      </div>`;
  }
  $("grelha").innerHTML = html;
}

function renderProximos() {
  const dias = Number($("janela").value);
  const ini = hoje0();
  const fim = new Date(ini); fim.setDate(fim.getDate() + dias);
  const a = dataISO(ini), b = dataISO(fim);
  const lista = filtrados().filter((e) => e.data >= a && e.data <= b);
  if (!lista.length) {
    $("proximos").innerHTML = `<p class="muted">Nada marcado nos próximos ${dias} dias${alunoFiltro ? " para este aluno" : ""}.</p>`;
    return;
  }
  const grupos = new Map();
  for (const e of lista) {
    if (!grupos.has(e.data)) grupos.set(e.data, []);
    grupos.get(e.data).push(e);
  }
  $("proximos").innerHTML = [...grupos.entries()].map(([iso, evs]) => {
    const d = parseISO(iso);
    const diff = Math.round((d - ini) / 86400000);
    const quando = diff === 0 ? "Hoje" : diff === 1 ? "Amanhã" : `${["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d.getDay()]}, ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
    return `
      <div class="prox-dia">
        <div class="prox-dia__data ${diff <= 2 ? "is-perto" : ""}">${quando}</div>
        ${evs.map((e) => {
          const quem = abrangidos(e);
          const reg = alunoPorId(e.aluno_id);
          return `
            <button type="button" class="prox-item" data-id="${e.id}">
              <span class="prox-item__tipo" style="background:${COR[e.tipo] ?? COR.Outro}">${esc(e.tipo)}</span>
              <span class="prox-item__corpo">
                <strong>${esc(discPorId(e.disciplina_id)?.nome ?? "Sem disciplina")}</strong>
                <span class="small">${quem.map((x) => esc(nomeAluno(x))).join(", ")}</span>
                ${e.aplica_turma && chaveTurma(reg) ? `<span class="small muted">${esc(rotuloTurma(reg))}</span>` : ""}
                ${e.notas ? `<span class="small muted">${esc(e.notas)}</span>` : ""}
              </span>
            </button>`;
        }).join("")}
      </div>`;
  }).join("");
}

// ---------- Navegação e filtros ----------

$("mes-ant").addEventListener("click", () => { mesVisto = new Date(mesVisto.getFullYear(), mesVisto.getMonth() - 1, 1); renderGrelha(); });
$("mes-seg").addEventListener("click", () => { mesVisto = new Date(mesVisto.getFullYear(), mesVisto.getMonth() + 1, 1); renderGrelha(); });
$("hoje").addEventListener("click", () => { mesVisto = new Date(hoje0().getFullYear(), hoje0().getMonth(), 1); renderGrelha(); });
$("janela").addEventListener("change", renderProximos);
$("f-disc-filtro").addEventListener("change", render);
$("f-tipo-filtro").addEventListener("change", render);

function aplicarPesquisa() {
  const v = $("f-aluno-busca").value;
  const a = alunoPorTexto(v);
  if (a || !v.trim()) { alunoFiltro = a; render(); }
}
$("f-aluno-busca").addEventListener("change", aplicarPesquisa);
$("f-aluno-busca").addEventListener("input", () => { if (!$("f-aluno-busca").value) aplicarPesquisa(); });
$("f-aluno-busca").addEventListener("keydown", (e) => { if (e.key === "Enter") aplicarPesquisa(); });

// ---------- Cliques na grelha / lista ----------

document.addEventListener("click", (e) => {
  const item = e.target.closest(".cal-chip, .prox-item");
  if (item) return abrir(eventos.find((x) => x.id === item.dataset.id));
  const mais = e.target.closest(".cal-mais");
  if (mais) {
    // Mostra a lista "Próximos" a partir desse dia? Mais simples: filtra a lista para esse dia.
    const evs = filtrados().filter((x) => x.data === mais.dataset.dia);
    $("proximos").scrollIntoView({ behavior: "smooth" });
    $("proximos").innerHTML = `<p class="small"><strong>${mais.dataset.dia.split("-").reverse().join("/")}</strong> · <button type="button" class="link-btn" id="voltar-prox">voltar aos próximos</button></p>` +
      evs.map((x) => `<button type="button" class="prox-item" data-id="${x.id}"><span class="prox-item__tipo" style="background:${COR[x.tipo]}">${esc(x.tipo)}</span><span class="prox-item__corpo"><strong>${esc(discPorId(x.disciplina_id)?.nome ?? "Sem disciplina")}</strong><span class="small">${abrangidos(x).map((y) => esc(nomeAluno(y))).join(", ")}</span></span></button>`).join("");
    $("voltar-prox").addEventListener("click", renderProximos);
    return;
  }
  const dia = e.target.closest(".cal__dia");
  if (dia && !e.target.closest("button")) abrir(null, { data: dia.dataset.data });
});

$("novo").addEventListener("click", () => abrir(null, { data: dataISO(hoje0()) }));

// ---------- Modal ----------

function mostrarTurmaModal() {
  const a = alunoModal;
  const el = $("m-turma");
  if (!a) { el.textContent = $("m-aluno").value ? "Aluno não encontrado — escolhe da lista." : ""; return; }
  const k = chaveTurma(a);
  if (!k) {
    el.innerHTML = `Sem escola/turma completa na ficha (${esc(rotuloTurma(a) || "—")}) — fica só para este aluno.`;
    return;
  }
  const colegas = turmaDe(a).filter((x) => x.id !== a.id);
  el.innerHTML = `Turma ${esc(rotuloTurma(a))}` +
    (colegas.length && $("m-turma-check").checked
      ? ` · também para: <strong>${colegas.map((c) => esc(nomeAluno(c))).join(", ")}</strong>`
      : colegas.length ? "" : " · sem colegas no centro");
}

$("m-aluno").addEventListener("input", () => { alunoModal = alunoPorTexto($("m-aluno").value); mostrarTurmaModal(); });
$("m-turma-check").addEventListener("change", mostrarTurmaModal);

function abrir(ev = null, base = {}) {
  editId = ev?.id ?? null;
  form.reset();
  fillForm(form, ev ?? { tipo: "Teste", aplica_turma: true, disciplina_id: $("f-disc-filtro").value || null, ...base });
  alunoModal = ev ? alunoPorId(ev.aluno_id) : alunoFiltro;
  $("m-aluno").value = alunoModal?.nome ?? "";
  mostrarTurmaModal();
  $("modal-title").textContent = ev ? "Editar" : "Novo teste / entrega";
  $("apagar").hidden = !ev;
  modal.showModal();
  if (!alunoModal) $("m-aluno").focus();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  alunoModal = alunoPorTexto($("m-aluno").value);
  if (!alunoModal) return toast("Escolhe o aluno da lista.", true);
  const d = formData(form);
  if (!d.data) return toast("Indica a data.", true);
  d.aluno_id = alunoModal.id;
  $("guardar").disabled = true;
  const { error } = editId
    ? await sb.from("avaliacoes").update(d).eq("id", editId)
    : await sb.from("avaliacoes").insert(d);
  $("guardar").disabled = false;
  if (failed(error, "Não foi possível guardar")) return;
  modal.close();
  toast("Guardado.");
  const dt = parseISO(d.data);
  mesVisto = new Date(dt.getFullYear(), dt.getMonth(), 1);
  carregar();
});

$("apagar").addEventListener("click", async () => {
  if (!confirm("Apagar este registo do calendário?")) return;
  const { error } = await sb.from("avaliacoes").delete().eq("id", editId);
  if (failed(error, "Não foi possível apagar")) return;
  modal.close();
  toast("Apagado.");
  carregar();
});

carregar();
