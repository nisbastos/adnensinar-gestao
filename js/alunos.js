import { ordenar, ligarOrdenacao, sb, requireAuth, esc, toast, failed, norm, formData, fillForm, wireModal, ANOS, DIAS_CURTOS, hhmm } from "./app.js";

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
  const [{ data: a, error: e1 }, { data: h, error: e2 }, { data: d, error: e3 }, { data: ad, error: e4 }] = await Promise.all([
    sb.from("alunos").select("*").order("nome"),
    sb.from("horario_alunos").select("aluno_id, horario(dia_semana, hora_inicio, hora_fim, categoria, disciplina:disciplinas(nome))"),
    sb.from("disciplinas").select("*").order("ordem").order("nome"),
    sb.from("aluno_disciplinas").select("aluno_id, disciplina_id"),
  ]);
  if (failed(e1, "Erro a carregar alunos") || failed(e2, "Erro a carregar horário") || failed(e3, "Erro a carregar disciplinas") || failed(e4, "Erro a carregar disciplinas dos alunos")) return;
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

/** "Maria Inês Costa Silva" → "Maria Silva" (o nome completo fica na ficha e ao passar o rato). */
const nomeCurto = (nome) => {
  const w = String(nome ?? "").trim().split(/\s+/);
  return w.length > 2 ? `${w[0]} ${w[w.length - 1]}` : w.join(" ");
};

const nomesDisc = (alunoId) =>
  disciplinas.filter((d) => discPorAluno.get(alunoId)?.has(d.id)).map((d) => d.nome).join(", ");


function render() {
  const q = norm($("search").value);
  const estado = $("filter-estado").value;
  const filtrados = alunos.filter((a) => {
    if (estado === "ativos" && !a.ativo) return false;
    if (estado === "inativos" && a.ativo) return false;
    if (!q) return true;
    return norm([a.nome, a.escola, a.encarregado_nome, a.encarregado_email, nomesDisc(a.id), a.nif, a.localidade, a.ano_turma].join(" ")).includes(q);
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
          <td class="col-nome" title="${esc(a.nome)}"><strong>${esc(nomeCurto(a.nome))}</strong>${a.ativo ? "" : ` <span class="badge badge--off">Inativo</span>`}</td>
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
  fillForm(form, aluno ?? { ativo: true });
  const escolhidas = discPorAluno.get(aluno?.id) ?? new Set();
  $("f-disc").innerHTML = disciplinas
    .filter((d) => d.ativo || escolhidas.has(d.id))
    .map((d) => `<label class="chip"><input type="checkbox" data-multi="1" value="${d.id}" ${escolhidas.has(d.id) ? "checked" : ""} /><span>${esc(d.nome)}</span></label>`)
    .join("") || `<span class="muted small">Sem disciplinas — cria-as na página Disciplinas.</span>`;
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
      const { error: e2 } = await sb.from("aluno_disciplinas").delete().eq("aluno_id", id);
      if (failed(e2, "Não foi possível atualizar as disciplinas")) return;
    } else {
      const { data, error } = await sb.from("alunos").insert(dados).select("id").single();
      if (failed(error, "Não foi possível guardar")) return;
      id = data.id;
    }
    if (discIds.length) {
      const { error } = await sb.from("aluno_disciplinas").insert(discIds.map((disciplina_id) => ({ aluno_id: id, disciplina_id })));
      if (failed(error, "O aluno foi guardado, mas houve um erro nas disciplinas")) return;
    }
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
