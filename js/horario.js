import { sincronizar, sb, requireAuth, esc, toast, failed, norm, formData, fillForm, wireModal, hhmm, toMin, DIAS, DIAS_CURTOS } from "./app.js";

await requireAuth();

// ---------- Configuração do horário do centro ----------
const DIAS_VISIVEIS = [1, 2, 3, 4, 5]; // segunda a sexta (sábado e domingo fechado)
let INICIO = 9 * 60;     // 09:00 (alarga se houver aulas mais cedo)
let FIM = 19 * 60;       // 19:00 (alarga se houver aulas mais tarde)
const SLOT_MIN = 30;     // cada linha = 30 min
// Altura de cada linha de 30 min: mais alta nas explicações (cartões curtos com mais texto).
const SLOT_ECRA = { "Apoio ao Estudo": 28, "Explicação": 36 };
let SLOT_PX = 28;
let aImprimir = false;

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
let disciplinas = [];
let alunos = [];
let editId = null;
let tipo = "Apoio ao Estudo"; // vista: "Apoio ao Estudo" | "Explicação"
let diaAtivo = Math.min(Math.max(new Date().getDay(), 1), 5); // usado em ecrãs pequenos

$("f-dia").innerHTML = DIAS.slice(1).map((d, i) => `<option value="${i + 1}">${d}</option>`).join("");

// ---------- Dados ----------

async function carregar() {
  const [r1, r2, r3, r4, r5] = await Promise.all([
    sb.from("horario").select("*, horario_alunos(aluno_id)").order("hora_inicio"),
    sb.from("professores").select("*").order("nome"),
    sb.from("alunos").select("id, nome, ano_escolar, ativo").order("nome"),
    sb.from("salas").select("*").order("ordem").order("nome"),
    sb.from("disciplinas").select("*").order("ordem").order("nome"),
  ]);
  if (failed(r1.error, "Erro a carregar horário") || failed(r2.error, "Erro a carregar professores") || failed(r3.error, "Erro a carregar alunos") || failed(r4.error, "Erro a carregar salas") || failed(r5.error, "Erro a carregar disciplinas")) return;

  aulas = r1.data.map((a) => ({ ...a, alunos: a.horario_alunos.map((x) => x.aluno_id) }));
  profs = r2.data;
  alunos = r3.data;
  salas = r4.data;
  disciplinas = r5.data;

  $("f-disc").innerHTML =
    `<option value="">—</option>` +
    disciplinas.filter((d) => d.ativo).map((d) => `<option value="${d.id}">${esc(d.nome)}</option>`).join("");

  $("f-sala").innerHTML =
    `<option value="">—</option>` +
    salas.filter((x) => x.ativo).map((x) => `<option value="${x.id}">${esc(x.nome)}${x.tipo && x.tipo !== "Ambas" ? " (" + esc(x.tipo) + ")" : ""}</option>`).join("");

  const filtroAtual = $("filter-prof").value;
  $("filter-prof").innerHTML =
    `<option value="">Todos os professores</option>` +
    profs.map((p) => `<option value="${p.id}">${esc(profCurto(p))}</option>`).join("") +
    `<option value="__none">Sem professor</option>`;
  $("filter-prof").value = filtroAtual;

  $("f-prof").innerHTML =
    `<option value="">—</option>` +
    profs.filter((p) => p.ativo).map((p) => `<option value="${p.id}">${esc(profCurto(p))}${p.nome.trim().includes(" ") ? " (" + esc(p.nome) + ")" : ""}</option>`).join("");

  $("legend").innerHTML = profs
    .filter((p) => p.ativo)
    .map((p) => `<span><i style="background:${esc(p.cor)}"></i>${esc(profCurto(p))}</span>`)
    .join("");

  preencherFiltroSala();
  render();
}

/** Salas visíveis na vista atual: do tipo escolhido ou "Ambas". */
const salasDoTipo = () =>
  salas.filter((x) => (x.tipo ?? "Ambas") === "Ambas" || x.tipo === tipo);

function preencherFiltroSala() {
  const atual = $("filter-sala").value;
  const opcoes = salasDoTipo().filter((x) => x.ativo);
  $("filter-sala").innerHTML =
    `<option value="">Todas as salas</option>` +
    opcoes.map((x) => `<option value="${x.id}">${esc(x.nome)}</option>`).join("");
  $("filter-sala").value = opcoes.some((x) => x.id === atual) ? atual : "";
}

const profPorId = (id) => profs.find((p) => p.id === id);
const alunoPorId = (id) => alunos.find((a) => a.id === id);
const salaPorId = (id) => salas.find((x) => x.id === id);
const discPorId = (id) => disciplinas.find((d) => d.id === id);

/** "César Silva" → "Prof. César" */
const profCurto = (p) => (p ? `Prof. ${String(p.nome).trim().split(/\s+/)[0]}` : "");

/** Nomes ainda por associar (guardados nas notas na importação). */
const porAssociar = (a) =>
  (a.notas?.match(/Alunos por associar:\s*(.+)/)?.[1] ?? "").split(",").map((x) => x.trim()).filter(Boolean);

/** "Maria Inês Costa Silva" → "Maria Silva" */
const nomeCurto = (nome) => {
  const w = String(nome ?? "").trim().split(/\s+/);
  return w.length > 1 ? `${w[0]} ${w[w.length - 1]}` : w[0];
};

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
  const q = norm($("filter-aluno").value);
  return aulas.filter((a) => {
    if (prof === "__none" && a.professor_id) return false;
    if (prof && prof !== "__none" && a.professor_id !== prof) return false;
    if (q && !a.alunos.some((id) => norm(alunoPorId(id)?.nome).includes(q))) return false;
    return true;
  });
}

/**
 * Colunas: para cada dia, uma coluna por sala do tipo escolhido.
 * Nas salas "Ambas" aparecem todas as aulas (para se ver a ocupação real).
 * Aulas da categoria escolhida sem sala vão para uma coluna "Sem sala" nesse dia.
 */
function grupos(visiveis) {
  const filtroSala = $("filter-sala").value;
  const doTipo = salasDoTipo().filter((x) => !filtroSala || x.id === filtroSala);
  return DIAS_VISIVEIS.map((d) => {
    const doDia = visiveis.filter((a) => a.dia_semana === d);
    const cols = doTipo
      .filter((x) => x.ativo || doDia.some((a) => a.sala_id === x.id))
      .map((x) => ({ dia: d, sala_id: x.id, label: x.nome, aulas: doDia.filter((a) => a.sala_id === x.id) }));
    const semSala = filtroSala ? [] : doDia.filter((a) => a.categoria === tipo && (!a.sala_id || !salaPorId(a.sala_id)));
    if (semSala.length) cols.push({ dia: d, sala_id: null, label: "Sem sala", aulas: semSala, semSala: true });
    return { dia: d, cols };
  });
}

function ajustarIntervalo() {
  INICIO = 9 * 60;
  FIM = 19 * 60;
  for (const a of aulas) {
    INICIO = Math.min(INICIO, Math.floor(toMin(a.hora_inicio) / 60) * 60);
    FIM = Math.max(FIM, Math.ceil(toMin(a.hora_fim) / 60) * 60);
  }
}

function render() {
  ajustarIntervalo();
  if (!aImprimir) SLOT_PX = SLOT_ECRA[tipo] ?? 28;
  const el = $("schedule");
  const gs = grupos(filtradas());
  const total = gs.reduce((n, g) => n + g.cols.length, 0);
  const altura = yDe(FIM);
  el.style.setProperty("--cols", Math.max(total, 1));
  el.style.setProperty("--slot-h", SLOT_PX + "px");
  el.style.setProperty("--cols-dia", Math.max(gs.find((g) => g.dia === diaAtivo)?.cols.length ?? 1, 1));

  if (!total) {
    el.innerHTML = `<div class="empty" style="grid-column: 1 / -1">Não há salas do tipo <strong>${esc(tipo)}</strong>. Cria-as (ou define o tipo) na página <a href="salas.html">Salas</a>.</div>`;
    renderTabs();
    return;
  }

  // Linha 1: dias (cada um ocupa as colunas das suas salas)
  let html = `<div class="schedule__corner" style="grid-row: span 2"></div>`;
  for (const g of gs) {
    if (!g.cols.length) continue;
    html += `<div class="schedule__dayhead ${g.dia === diaAtivo ? "is-active" : ""}" data-day="${g.dia}" style="grid-column: span ${g.cols.length}">${DIAS[g.dia]}</div>`;
  }
  // Linha 2: salas
  for (const g of gs) {
    g.cols.forEach((c, i) => {
      html += `<div class="schedule__roomhead ${i === 0 ? "day-start" : ""} ${c.semSala ? "is-none" : ""} ${g.dia === diaAtivo ? "is-active" : ""}" data-day="${g.dia}" title="${esc(c.label)}">${esc(c.label)}</div>`;
    });
  }

  // Coluna das horas
  html += `<div class="schedule__times" style="height:${altura}px">`;
  for (let m = INICIO; m < FIM; m += 60) {
    html += `<div class="schedule__time">${String(m / 60).padStart(2, "0")}:00</div>`;
  }
  html += `</div>`;

  for (const g of gs) {
    g.cols.forEach((c, i) => {
      html += `<div class="schedule__col ${i === 0 ? "day-start" : ""} ${g.dia === diaAtivo ? "is-active" : ""}" data-day="${g.dia}" data-sala="${c.sala_id ?? ""}" style="height:${altura}px">`;
      for (const [dia, ini, fim] of FECHADO) {
        if (dia !== 0 && dia !== g.dia) continue;
        html += `<div class="schedule__closed" style="top:${yDe(toMin(ini))}px;height:${yDe(toMin(fim)) - yDe(toMin(ini))}px"></div>`;
      }
      for (const { aula: a, faixa, total: n } of emFaixas(c.aulas)) {
        const p = profPorId(a.professor_id);
        const top = yDe(toMin(a.hora_inicio));
        const h = Math.max(yDe(toMin(a.hora_fim)) - top - 2, 18);
        const w = 100 / n;
        const apoio = a.categoria === "Apoio ao Estudo";
        const nomes = [
          ...a.alunos.map((id) => (apoio ? alunoPorId(id)?.nome?.split(" ")[0] : nomeCurto(alunoPorId(id)?.nome))).filter(Boolean),
          ...porAssociar(a),
        ];
        const titulo = discPorId(a.disciplina_id)?.nome || a.categoria || "Aula";
        const outra = a.categoria && a.categoria !== tipo;
        const quando = `${hhmm(a.hora_inicio)}–${hhmm(a.hora_fim)}`;
        const tooltip = [titulo, quando, profCurto(p), a.categoria, nomes.join(", ")].filter(Boolean).map(esc).join(" · ");
        html += `
          <div class="lesson ${apoio ? "lesson--apoio" : "lesson--exp"} ${outra ? "lesson--outra" : ""}" data-id="${a.id}" tabindex="0"
               style="top:${top + 1}px;height:${h}px;left:calc(${faixa * w}% + 2px);width:calc(${w}% - 4px);background:${esc(p?.cor ?? "#eeeeee")}"
               title="${tooltip}">
            ${apoio
              ? `<strong>${quando}</strong>
                 ${p ? `<span class="lesson__prof">${esc(profCurto(p))}</span>` : ""}
                 ${outra ? `<span class="lesson__tag">${esc(a.categoria)}</span>` : ""}
                 ${nomes.length ? `<div class="lesson__students">${nomes.map(esc).join(", ")}</div>` : ""}
                 <span class="lesson__count">${nomes.length} ${nomes.length === 1 ? "aluno" : "alunos"}</span>`
              : `<strong>${esc(titulo)}</strong>
                 ${p ? `<span class="lesson__prof">${esc(profCurto(p))}</span>` : ""}
                 ${nomes.length ? `<span class="lesson__students">${nomes.map(esc).join(", ")}</span>` : ""}
                 <span class="lesson__time">${quando}</span>
                 ${outra ? `<span class="lesson__tag">${esc(a.categoria)}</span>` : ""}`}
          </div>`;
      }
      html += `</div>`;
    });
  }
  el.innerHTML = html;
  renderTabs();
}

function renderTabs() {
  $("day-tabs").innerHTML = DIAS_VISIVEIS.map(
    (d) => `<button type="button" data-day="${d}" aria-pressed="${d === diaAtivo}">${DIAS_CURTOS[d]}</button>`
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
  abrir(null, {
    dia_semana: Number(col.dataset.day),
    sala_id: col.dataset.sala || null,
    categoria: tipo,
    hora_inicio: fmt(ini),
    hora_fim: fmt(Math.min(ini + 60, FIM)),
  });
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
$("filter-aluno").addEventListener("input", render);
document.querySelectorAll(".segmented [data-tipo]").forEach((b) =>
  b.addEventListener("click", () => {
    tipo = b.dataset.tipo;
    document.querySelectorAll(".segmented [data-tipo]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    preencherFiltroSala();
    render();
  })
);

// ---------- Exportar PDF (impressão do que está no ecrã, com os filtros) ----------

function descricaoFiltros() {
  const partes = [tipo];
  const sel = (id) => $(id).selectedOptions[0];
  if ($("filter-sala").value) partes.push(`Sala: ${sel("filter-sala").textContent}`);
  if ($("filter-prof").value) partes.push(`Professor: ${sel("filter-prof").textContent}`);
  const q = $("filter-aluno").value.trim();
  if (q) partes.push(`Aluno: "${q}"`);
  return partes;
}

const tituloOriginal = document.title;

// A4 deitado com margens de 8 mm: ~733 px de altura útil. Reservamos o cabeçalho,
// as linhas dos dias/salas e a legenda, e o resto é repartido pelas linhas do horário.
const ALTURA_UTIL_PX = 733;
const RESERVADO_PX = 165;

window.addEventListener("beforeprint", () => {
  const partes = descricaoFiltros().slice(1);
  const hoje = new Date().toLocaleDateString("pt-PT");
  $("print-title").textContent = tipo === "Explicação" ? "Horário de Explicações" : "Horário de Apoio ao Estudo";
  $("print-sub").textContent = [...partes, `Gerado a ${hoje}`].join(" · ");
  document.title = `Horário ADN Ensinar - ${descricaoFiltros().join(" - ").replace(/[\\/:*?"<>|]/g, "")}`;
  aImprimir = true;
  ajustarIntervalo();
  const linhas = (FIM - INICIO) / SLOT_MIN;
  SLOT_PX = Math.max(12, Math.min(30, Math.floor((ALTURA_UTIL_PX - RESERVADO_PX) / linhas)));
  render();
});

window.addEventListener("afterprint", () => {
  document.title = tituloOriginal;
  aImprimir = false;
  render();
});

$("exportar").addEventListener("click", () => window.print());

$("nova").addEventListener("click", () => abrir(null, { dia_semana: diaAtivo, categoria: tipo, hora_inicio: "14:00", hora_fim: "15:00" }));

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
  const atual = aula?.disciplina_id && discPorId(aula.disciplina_id);
  if (atual && !atual.ativo && !$("f-disc").querySelector(`option[value="${atual.id}"]`)) {
    $("f-disc").insertAdjacentHTML("beforeend", `<option value="${atual.id}">${esc(atual.nome)} (fora de uso)</option>`);
  }
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
      avisos.push(`${profCurto(profPorId(a.professor_id))} já tem aula das ${quando}.`);
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
    } else {
      const { data, error } = await sb.from("horario").insert(dados).select("id").single();
      if (failed(error, "Não foi possível guardar")) return;
      id = data.id;
    }
    const e2 = await sincronizar("horario_alunos", "horario_id", id, "aluno_id", [...selecionados]);
    if (failed(e2, "A aula foi guardada, mas houve um erro com os alunos")) return;
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
