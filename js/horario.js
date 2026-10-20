import { sb, requireAuth, esc, toast, failed, norm, formData, fillForm, wireModal, hhmm, toMin, DIAS, DIAS_CURTOS } from "./app.js";

await requireAuth();

// ---------- Configuração do horário do centro ----------
const DIAS_VISIVEIS = [1, 2, 3, 4, 5]; // segunda a sexta (sábado e domingo fechado)
const INICIO = 9 * 60;   // 09:00
const FIM = 19 * 60;     // 19:00 (o centro fecha às 18:30)
const SLOT_MIN = 30;     // cada linha = 30 min
let SLOT_PX = 28;        // altura de cada linha (reduz ao imprimir)

// Períodos fechados [dia (0 = todos), início, fim], para sombrear na grelha.
const FECHADO = [
  [0, "12:00", "14:00"], // almoço
  [3, "09:00", "12:00"], // quarta de manhã
  [0, "18:30", "19:00"], // depois do fecho
];

const $ = (id) => document.getElementById(id);
const modal = $("modal");
const form = $("form");
wireModal(modal);

let aulas = [];       // horario + alunos
let profs = [];
let salas = [];
let vista = "semana"; // "semana" | "salas"
let alunos = [];
let editId = null;
let diaAtivo = Math.min(Math.max(new Date().getDay(), 1), 5);

$("f-dia").innerHTML = DIAS.slice(1).map((d, i) => `<option value="${i + 1}">${d}</option>`).join("");

// ---------- Dados ----------

async function carregar() {
  const [r1, r2, r3, r4] = await Promise.all([
    sb.from("horario").select("*, horario_alunos(aluno_id)").order("hora_inicio"),
    sb.from("professores").select("*").order("nome"),
    sb.from("alunos").select("id, nome, ano_escolar, ativo").order("nome"),
    sb.from("salas").select("*").order("ordem").order("nome"),
  ]);
  if (failed(r1.error, "Erro a carregar horário") || failed(r2.error, "Erro a carregar professores") || failed(r3.error, "Erro a carregar alunos") || failed(r4.error, "Erro a carregar salas")) return;

  aulas = r1.data.map((a) => ({ ...a, alunos: a.horario_alunos.map((x) => x.aluno_id) }));
  profs = r2.data;
  alunos = r3.data;
  salas = r4.data;

  const salaAtual = $("filter-sala").value;
  $("filter-sala").innerHTML =
    `<option value="">Todas as salas</option>` +
    salas.map((x) => `<option value="${x.id}">${esc(x.nome)}</option>`).join("") +
    `<option value="__none">Sem sala</option>`;
  $("filter-sala").value = salaAtual;

  $("f-sala").innerHTML =
    `<option value="">—</option>` +
    salas.filter((x) => x.ativo).map((x) => `<option value="${x.id}">${esc(x.nome)}</option>`).join("");

  const filtroAtual = $("filter-prof").value;
  $("filter-prof").innerHTML =
    `<option value="">Todos os professores</option>` +
    profs.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join("") +
    `<option value="__none">Sem professor</option>`;
  $("filter-prof").value = filtroAtual;

  $("f-prof").innerHTML =
    `<option value="">—</option>` +
    profs.filter((p) => p.ativo).map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join("");

  $("legend").innerHTML = profs
    .filter((p) => p.ativo)
    .map((p) => `<span><i style="background:${esc(p.cor)}"></i>${esc(p.nome)}</span>`)
    .join("");

  render();
}

const profPorId = (id) => profs.find((p) => p.id === id);
const alunoPorId = (id) => alunos.find((a) => a.id === id);
const salaPorId = (id) => salas.find((x) => x.id === id);

// ---------- Grelha ----------

const yDe = (min) => ((min - INICIO) / SLOT_MIN) * SLOT_PX;

/** Distribui aulas sobrepostas em colunas lado a lado. */
function emFaixas(lista) {
  const ord = [...lista].sort((a, b) => toMin(a.hora_inicio) - toMin(b.hora_inicio));
  const out = [];
  let grupo = [], fimGrupo = -1;
  const fechar = () => {
    const faixas = [];
    for (const a of grupo) {
      let i = faixas.findIndex((f) => f <= toMin(a.hora_inicio));
      if (i === -1) { i = faixas.length; faixas.push(0); }
      faixas[i] = toMin(a.hora_fim);
      out.push({ aula: a, faixa: i });
    }
    for (const o of out.slice(-grupo.length)) o.total = faixas.length;
    grupo = [];
  };
  for (const a of ord) {
    if (grupo.length && toMin(a.hora_inicio) >= fimGrupo) fechar();
    grupo.push(a);
    fimGrupo = Math.max(fimGrupo, toMin(a.hora_fim));
  }
  if (grupo.length) fechar();
  return out;
}

function filtradas() {
  const prof = $("filter-prof").value;
  const sala = $("filter-sala").value;
  const q = norm($("filter-aluno").value);
  return aulas.filter((a) => {
    if (prof === "__none" && a.professor_id) return false;
    if (prof && prof !== "__none" && a.professor_id !== prof) return false;
    if (sala === "__none" && a.sala_id) return false;
    if (sala && sala !== "__none" && a.sala_id !== sala) return false;
    if (q && !a.alunos.some((id) => norm(alunoPorId(id)?.nome).includes(q))) return false;
    return true;
  });
}

/** Colunas da grelha: dias da semana, ou salas do dia escolhido. */
function colunas(visiveis) {
  if (vista === "semana") {
    return DIAS_VISIVEIS.map((d) => ({ key: String(d), label: DIAS[d], dia: d, aulas: visiveis.filter((a) => a.dia_semana === d) }));
  }
  const doDia = visiveis.filter((a) => a.dia_semana === diaAtivo);
  const filtroSala = $("filter-sala").value;
  const cols = salas
    .filter((x) => (x.ativo || doDia.some((a) => a.sala_id === x.id)) && (!filtroSala || filtroSala === x.id))
    .map((x) => ({ key: x.id, label: x.nome, dia: diaAtivo, sala_id: x.id, aulas: doDia.filter((a) => a.sala_id === x.id) }));
  const semSala = doDia.filter((a) => !a.sala_id || !salaPorId(a.sala_id));
  if (semSala.length || filtroSala === "__none") cols.push({ key: "__none", label: "Sem sala", dia: diaAtivo, sala_id: null, aulas: semSala });
  return cols;
}

function render() {
  const el = $("schedule");
  const cols = colunas(filtradas());
  const salasVista = vista === "salas";
  el.classList.toggle("schedule--rooms", salasVista);
  el.style.setProperty("--days", Math.max(cols.length, 1));
  el.style.setProperty("--slot-h", SLOT_PX + "px");
  const altura = yDe(FIM);

  let html = `<div class="schedule__corner"></div>`;
  html += cols.map(
    (c) => `<div class="schedule__dayhead ${!salasVista && c.dia === diaAtivo ? "is-active" : ""}" data-day="${c.dia}">${esc(c.label)}</div>`
  ).join("");

  // Coluna das horas
  html += `<div class="schedule__times" style="height:${altura}px">`;
  for (let m = INICIO; m < FIM; m += 60) {
    html += `<div class="schedule__time">${String(m / 60).padStart(2, "0")}:00</div>`;
  }
  html += `</div>`;

  for (const c of cols) {
    html += `<div class="schedule__col ${!salasVista && c.dia === diaAtivo ? "is-active" : ""}" data-day="${c.dia}" data-sala="${c.sala_id ?? ""}" style="height:${altura}px">`;
    for (const [dia, ini, fim] of FECHADO) {
      if (dia !== 0 && dia !== c.dia) continue;
      html += `<div class="schedule__closed" style="top:${yDe(toMin(ini))}px;height:${yDe(toMin(fim)) - yDe(toMin(ini))}px"></div>`;
    }
    for (const { aula: a, faixa, total } of emFaixas(c.aulas)) {
      const p = profPorId(a.professor_id);
      const sala = salaPorId(a.sala_id);
      const top = yDe(toMin(a.hora_inicio));
      const h = Math.max(yDe(toMin(a.hora_fim)) - top - 2, 18);
      const w = 100 / total;
      const nomes = a.alunos.map((id) => alunoPorId(id)?.nome?.split(" ")[0]).filter(Boolean);
      const titulo = a.disciplina || a.categoria || "Aula";
      const extra = [p?.nome, !salasVista ? sala?.nome : null].filter(Boolean).map(esc).join(" · ");
      html += `
        <div class="lesson" data-id="${a.id}" tabindex="0"
             style="top:${top + 1}px;height:${h}px;left:calc(${faixa * w}% + 3px);width:calc(${w}% - 6px);background:${esc(p?.cor ?? "#eeeeee")}"
             title="${esc(titulo)} · ${hhmm(a.hora_inicio)}–${hhmm(a.hora_fim)}${extra ? " · " + extra : ""}">
          <strong>${esc(titulo)}</strong>
          <span class="lesson__time">${hhmm(a.hora_inicio)}–${hhmm(a.hora_fim)}${extra ? " · " + extra : ""}</span>
          ${nomes.length ? `<div class="lesson__students">${nomes.map(esc).join(", ")}</div>` : ""}
        </div>`;
    }
    html += `</div>`;
  }
  if (!cols.length) html += `<div class="empty" style="grid-column: 2 / -1">Ainda não há salas — cria-as na página Salas.</div>`;
  el.innerHTML = html;

  $("day-tabs").classList.toggle("day-tabs--always", salasVista);
  $("day-tabs").innerHTML = DIAS_VISIVEIS.map(
    (d) => `<button type="button" data-day="${d}" aria-pressed="${d === diaAtivo}">${salasVista ? DIAS[d] : DIAS_CURTOS[d]}</button>`
  ).join("");
}

// ---------- Interação com a grelha ----------

$("schedule").addEventListener("click", (e) => {
  const bloco = e.target.closest(".lesson");
  if (bloco) return abrir(aulas.find((a) => a.id === bloco.dataset.id));

  const col = e.target.closest(".schedule__col");
  if (!col) return;
  const y = e.clientY - col.getBoundingClientRect().top;
  const ini = INICIO + Math.floor(y / SLOT_PX) * SLOT_MIN;
  const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  abrir(null, { dia_semana: Number(col.dataset.day), sala_id: col.dataset.sala || null, hora_inicio: fmt(ini), hora_fim: fmt(Math.min(ini + 60, FIM)) });
});

$("schedule").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.classList.contains("lesson")) e.target.click();
});

$("day-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-day]");
  if (!b) return;
  diaAtivo = Number(b.dataset.day);
  render();
});

$("filter-prof").addEventListener("change", render);
$("filter-sala").addEventListener("change", render);
document.querySelectorAll(".segmented [data-view]").forEach((b) =>
  b.addEventListener("click", () => {
    vista = b.dataset.view;
    document.querySelectorAll(".segmented [data-view]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    render();
  })
);
$("filter-aluno").addEventListener("input", render);
// ---------- Exportar PDF (impressão do que está no ecrã, com os filtros) ----------

function descricaoFiltros() {
  const partes = [vista === "salas" ? `Por sala · ${DIAS[diaAtivo]}` : "Semana"];
  const sel = (id) => $(id).selectedOptions[0];
  if ($("filter-sala").value) partes.push(`Sala: ${sel("filter-sala").textContent}`);
  if ($("filter-prof").value) partes.push(`Professor: ${sel("filter-prof").textContent}`);
  const q = $("filter-aluno").value.trim();
  if (q) partes.push(`Aluno: "${q}"`);
  return partes;
}

const tituloOriginal = document.title;

window.addEventListener("beforeprint", () => {
  const partes = descricaoFiltros();
  const hoje = new Date().toLocaleDateString("pt-PT");
  $("print-title").textContent = "Horário · ADN Ensinar";
  $("print-sub").textContent = `${partes.join(" · ")} — gerado a ${hoje}`;
  document.title = `Horário ADN Ensinar - ${partes.join(" - ").replace(/[\\/:*?"<>|]/g, "")}`;
  SLOT_PX = 26;
  render();
});

window.addEventListener("afterprint", () => {
  document.title = tituloOriginal;
  SLOT_PX = 28;
  render();
});

$("exportar").addEventListener("click", () => window.print());

$("nova").addEventListener("click", () => abrir(null, { dia_semana: diaAtivo, hora_inicio: "14:00", hora_fim: "15:00" }));

// ---------- Modal ----------

let selecionados = new Set();

function renderPick() {
  const q = norm($("f-pick-search").value);
  const lista = alunos.filter((a) => (a.ativo || selecionados.has(a.id)) && (!q || norm(a.nome).includes(q)));
  // selecionados primeiro
  lista.sort((a, b) => selecionados.has(b.id) - selecionados.has(a.id) || a.nome.localeCompare(b.nome, "pt"));
  $("pick-list").innerHTML = lista.length
    ? lista.map((a) => `
        <label class="check">
          <input type="checkbox" data-multi="1" value="${a.id}" ${selecionados.has(a.id) ? "checked" : ""} />
          ${esc(a.nome)} ${a.ano_escolar ? `<span class="muted small">${esc(a.ano_escolar)}</span>` : ""}
        </label>`).join("")
    : `<div class="muted small" style="padding:8px">${alunos.length ? "Nenhum aluno encontrado." : "Ainda não há alunos — cria-os na página Alunos."}</div>`;
  $("pick-count").textContent = selecionados.size ? `(${selecionados.size} selecionado${selecionados.size > 1 ? "s" : ""})` : "";
}

$("pick-list").addEventListener("change", (e) => {
  if (e.target.type !== "checkbox") return;
  e.target.checked ? selecionados.add(e.target.value) : selecionados.delete(e.target.value);
  $("pick-count").textContent = selecionados.size ? `(${selecionados.size} selecionado${selecionados.size > 1 ? "s" : ""})` : "";
});
$("f-pick-search").addEventListener("input", renderPick);

function abrir(aula = null, base = {}) {
  editId = aula?.id ?? null;
  form.reset();
  fillForm(form, aula ?? base);
  selecionados = new Set(aula?.alunos ?? []);
  $("f-pick-search").value = "";
  renderPick();
  $("modal-title").textContent = aula ? "Editar aula" : "Nova aula";
  $("apagar").hidden = !aula;
  modal.showModal();
}

/** Devolve avisos de sobreposição (mesmo professor ou mesmo aluno à mesma hora). */
function conflitos(dados) {
  const ini = toMin(dados.hora_inicio), fim = toMin(dados.hora_fim);
  const avisos = [];
  for (const a of aulas) {
    if (a.id === editId || a.dia_semana !== Number(dados.dia_semana)) continue;
    if (toMin(a.hora_inicio) >= fim || toMin(a.hora_fim) <= ini) continue;
    const quando = `${hhmm(a.hora_inicio)}–${hhmm(a.hora_fim)}`;
    if (dados.professor_id && a.professor_id === dados.professor_id) {
      avisos.push(`${profPorId(a.professor_id)?.nome} já tem aula das ${quando}.`);
    }
    if (dados.sala_id && a.sala_id === dados.sala_id) {
      avisos.push(`${salaPorId(a.sala_id)?.nome} já está ocupada das ${quando}.`);
    }
    for (const id of a.alunos) {
      if (selecionados.has(id)) avisos.push(`${alunoPorId(id)?.nome} já está numa aula das ${quando}.`);
    }
  }
  return avisos;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const dados = formData(form);
  if (!dados.hora_inicio || !dados.hora_fim) return toast("Indica a hora de início e de fim.", true);
  if (toMin(dados.hora_fim) <= toMin(dados.hora_inicio)) return toast("A hora de fim tem de ser depois do início.", true);
  dados.dia_semana = Number(dados.dia_semana);

  const avisos = conflitos(dados);
  if (avisos.length && !confirm("Atenção — sobreposição:\n\n• " + avisos.join("\n• ") + "\n\nGuardar mesmo assim?")) return;

  $("guardar").disabled = true;
  try {
    let id = editId;
    if (id) {
      const { error } = await sb.from("horario").update(dados).eq("id", id);
      if (failed(error, "Não foi possível guardar")) return;
      const { error: e2 } = await sb.from("horario_alunos").delete().eq("horario_id", id);
      if (failed(e2, "Não foi possível atualizar os alunos")) return;
    } else {
      const { data, error } = await sb.from("horario").insert(dados).select("id").single();
      if (failed(error, "Não foi possível guardar")) return;
      id = data.id;
    }
    if (selecionados.size) {
      const linhas = [...selecionados].map((aluno_id) => ({ horario_id: id, aluno_id }));
      const { error } = await sb.from("horario_alunos").insert(linhas);
      if (failed(error, "A aula foi guardada, mas houve um erro com os alunos")) return;
    }
    modal.close();
    toast(editId ? "Aula atualizada." : "Aula criada.");
    diaAtivo = dados.dia_semana;
    carregar();
  } finally {
    $("guardar").disabled = false;
  }
});

$("apagar").addEventListener("click", async () => {
  if (!confirm("Apagar esta aula do horário?")) return;
  const { error } = await sb.from("horario").delete().eq("id", editId);
  if (failed(error, "Não foi possível apagar")) return;
  modal.close();
  toast("Aula apagada.");
  carregar();
});

carregar();
