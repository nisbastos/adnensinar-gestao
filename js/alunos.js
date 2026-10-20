import { sb, requireAuth, esc, toast, failed, norm, formData, fillForm, wireModal, ANOS, DIAS_CURTOS, hhmm } from "./app.js";

await requireAuth();

const $ = (id) => document.getElementById(id);
const lista = $("lista");
const modal = $("modal");
const form = $("form");
wireModal(modal);

$("f-ano").innerHTML = `<option value="">—</option>` + ANOS.map((a) => `<option>${a}</option>`).join("");

let alunos = [];
let aulasPorAluno = new Map(); // aluno_id → [{dia, inicio, fim, disciplina}]
let editId = null;

async function carregar() {
  const [{ data: a, error: e1 }, { data: h, error: e2 }] = await Promise.all([
    sb.from("alunos").select("*").order("nome"),
    sb.from("horario_alunos").select("aluno_id, horario(dia_semana, hora_inicio, hora_fim, disciplina, categoria)"),
  ]);
  if (failed(e1, "Erro a carregar alunos") || failed(e2, "Erro a carregar horário")) return;
  alunos = a;
  aulasPorAluno = new Map();
  for (const r of h) {
    if (!r.horario) continue;
    if (!aulasPorAluno.has(r.aluno_id)) aulasPorAluno.set(r.aluno_id, []);
    aulasPorAluno.get(r.aluno_id).push(r.horario);
  }
  render();
}

function servicoBadge(s) {
  if (!s) return `<span class="muted">—</span>`;
  const cls = s === "Explicação" ? "badge--yellow" : s === "Apoio ao Estudo" ? "badge--green" : "badge--pink";
  return `<span class="badge ${cls}">${esc(s)}</span>`;
}

function render() {
  const q = norm($("search").value);
  const estado = $("filter-estado").value;
  const filtrados = alunos.filter((a) => {
    if (estado === "ativos" && !a.ativo) return false;
    if (estado === "inativos" && a.ativo) return false;
    if (!q) return true;
    return norm([a.nome, a.escola, a.encarregado_nome, a.encarregado_email, a.disciplinas].join(" ")).includes(q);
  });

  $("contagem").textContent = `${filtrados.length} ${filtrados.length === 1 ? "aluno" : "alunos"}`;
  $("vazio").hidden = filtrados.length > 0;

  lista.innerHTML = filtrados
    .map((a) => {
      const n = aulasPorAluno.get(a.id)?.length ?? 0;
      const contacto = [a.encarregado_telefone, a.encarregado_email].filter(Boolean).map(esc).join("<br>");
      return `
        <tr data-id="${a.id}">
          <td><strong>${esc(a.nome)}</strong>${a.ativo ? "" : ` <span class="badge badge--off">Inativo</span>`}</td>
          <td>${esc(a.ano_escolar) || `<span class="muted">—</span>`}</td>
          <td>${servicoBadge(a.servico)}</td>
          <td>${esc(a.encarregado_nome) || `<span class="muted">—</span>`}</td>
          <td class="small">${contacto || `<span class="muted">—</span>`}</td>
          <td>${n || `<span class="muted">0</span>`}</td>
        </tr>`;
    })
    .join("");
}

function abrir(aluno = null) {
  editId = aluno?.id ?? null;
  form.reset();
  fillForm(form, aluno ?? { ativo: true });
  $("modal-title").textContent = aluno ? "Editar aluno" : "Novo aluno";
  $("apagar").hidden = !aluno;

  const aulas = (aluno && aulasPorAluno.get(aluno.id)) || [];
  $("f-aulas").innerHTML = aulas.length
    ? "No horário: " +
      aulas
        .sort((x, y) => x.dia_semana - y.dia_semana || x.hora_inicio.localeCompare(y.hora_inicio))
        .map((h) => `${DIAS_CURTOS[h.dia_semana]} ${hhmm(h.hora_inicio)}–${hhmm(h.hora_fim)}${h.disciplina ? " (" + esc(h.disciplina) + ")" : ""}`)
        .join(" · ")
    : aluno ? "Ainda não está em nenhuma aula do horário." : "";
  modal.showModal();
  $("f-nome").focus();
}

lista.addEventListener("click", (e) => {
  const tr = e.target.closest("tr[data-id]");
  if (tr) abrir(alunos.find((a) => a.id === tr.dataset.id));
});

$("novo").addEventListener("click", () => abrir());
$("search").addEventListener("input", render);
$("filter-estado").addEventListener("change", render);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const dados = formData(form);
  if (!dados.nome) return toast("O nome é obrigatório.", true);

  $("guardar").disabled = true;
  const { error } = editId
    ? await sb.from("alunos").update(dados).eq("id", editId)
    : await sb.from("alunos").insert(dados);
  $("guardar").disabled = false;
  if (failed(error, "Não foi possível guardar")) return;

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
