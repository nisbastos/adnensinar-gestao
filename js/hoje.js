import {
  nomeAluno, sb, requireAuth, esc, failed, norm, hhmm, toMin, DIAS, MESES,
  euro, cent, inicioMes, nomeMes,
} from "./app.js";

await requireAuth();

const $ = (id) => document.getElementById(id);
const DIA_LIMITE = 8; // dia a partir do qual uma mensalidade por pagar está em atraso

let aulas = [], alunos = [], profs = [], salas = [], disciplinas = [], mensalidades = [];
let filtroTipo = "";

const profPorId = (id) => profs.find((p) => p.id === id);
const salaPorId = (id) => salas.find((s) => s.id === id);
const discPorId = (id) => disciplinas.find((d) => d.id === id);
const alunoPorId = (id) => alunos.find((a) => a.id === id);
const profCurto = (p) => (p ? `Prof. ${String(p.nome).trim().split(/\s+/)[0]}` : "");
const porAssociar = (a) =>
  (a.notas?.match(/Alunos por associar:\s*(.+)/)?.[1] ?? "").split(",").map((x) => x.trim()).filter(Boolean);

/** Respostas como "Não", "Nenhuma", "N/A" não contam como informação de saúde. */
const temSaude = (t) => {
  const n = norm(t).trim().replace(/[.!]+$/, "");
  return n && !/^(nao|nenhum|nenhuma|n\/a|na|sem|nada|-|nao tem|nao se aplica)\b/.test(n);
};

// ---------- Dia a mostrar ----------

function diaAMostrar(agora) {
  const d = agora.getDay(); // 0 = domingo
  if (d >= 1 && d <= 5) return { dia: d, hoje: true };
  return { dia: 1, hoje: false }; // fim de semana → mostra segunda-feira
}

// ---------- Dados ----------

async function carregar() {
  const mes = inicioMes(new Date());
  const rs = await Promise.all([
    sb.from("horario").select("*, horario_alunos(aluno_id)"),
    sb.from("alunos").select("id, nome, nome_comum, ativo, saude, autoriza_saida, data_nascimento"),
    sb.from("professores").select("id, nome, cor"),
    sb.from("salas").select("id, nome, ordem"),
    sb.from("disciplinas").select("id, nome"),
    sb.from("mensalidades").select("aluno_id, total, estado, valor_pago").eq("mes", mes),
  ]);
  const nomes = ["horário", "alunos", "professores", "salas", "disciplinas"];
  for (let i = 0; i < nomes.length; i++) if (failed(rs[i].error, `Erro a carregar ${nomes[i]}`)) return;

  aulas = rs[0].data.map((a) => ({ ...a, alunos: a.horario_alunos.map((x) => x.aluno_id) }));
  alunos = rs[1].data;
  profs = rs[2].data;
  salas = rs[3].data;
  disciplinas = rs[4].data;
  mensalidades = rs[5].error ? null : rs[5].data; // null = tabela ainda não existe
  render();
}

// ---------- Render ----------

function nomesDaAula(a) {
  return [...a.alunos.map((id) => nomeAluno(alunoPorId(id))).filter(Boolean), ...porAssociar(a)];
}


function render() {
  const agora = new Date();
  const { dia, hoje } = diaAMostrar(agora);
  const minAgora = agora.getHours() * 60 + agora.getMinutes();

  $("titulo").textContent = hoje ? "Hoje" : "Próxima segunda-feira";
  $("subtitulo").textContent = hoje
    ? `${DIAS[dia]}, ${agora.getDate()} de ${MESES[agora.getMonth()]}`
    : "O centro está fechado ao fim de semana. Mostramos as aulas de segunda.";
  $("agora-hora").textContent = hoje ? `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}` : "";

  const doDia = aulas
    .filter((a) => a.dia_semana === dia)
    .sort((x, y) => toMin(x.hora_inicio) - toMin(y.hora_inicio) || (salaPorId(x.sala_id)?.ordem ?? 99) - (salaPorId(y.sala_id)?.ordem ?? 99));

  renderAgora(hoje ? doDia.filter((a) => toMin(a.hora_inicio) <= minAgora && minAgora < toMin(a.hora_fim)) : null);
  renderAulas(doDia, hoje ? minAgora : null);
  renderAlertas(doDia);
  renderAniversarios(agora);
  renderMensalidades(agora);
}

function renderAgora(lista) {
  if (lista === null) {
    $("agora").innerHTML = `<p class="muted">Fechado.</p>`;
    return;
  }
  if (!lista.length) {
    $("agora").innerHTML = `<p class="muted">Nenhuma aula a decorrer neste momento.</p>`;
    return;
  }
  const porSala = new Map();
  for (const a of lista) {
    const k = a.sala_id ?? "__";
    if (!porSala.has(k)) porSala.set(k, []);
    porSala.get(k).push(a);
  }
  const chaves = [...porSala.keys()].sort((x, y) => (salaPorId(x)?.ordem ?? 99) - (salaPorId(y)?.ordem ?? 99));
  $("agora").innerHTML = `<div class="salas-agora">${chaves.map((k) => {
    const items = porSala.get(k);
    const total = items.reduce((t, a) => t + nomesDaAula(a).length, 0);
    return `
      <div class="sala-agora">
        <div class="sala-agora__head">
          <strong>${esc(salaPorId(k)?.nome ?? "Sem sala")}</strong>
          <span class="muted small">${total} ${total === 1 ? "aluno" : "alunos"}</span>
        </div>
        ${items.map((a) => {
          const p = profPorId(a.professor_id);
          return `
            <div class="sala-agora__aula" style="border-left-color:${esc(p?.cor ?? "#ddd")}">
              <div class="small"><strong>${esc(discPorId(a.disciplina_id)?.nome ?? a.categoria ?? "Aula")}</strong> · até ${hhmm(a.hora_fim)}</div>
              ${p ? `<div class="small"><strong>${esc(profCurto(p))}</strong></div>` : ""}
              <div class="small muted">${nomesDaAula(a).map((n) => esc(n)).join(", ") || "Sem alunos"}</div>
            </div>`;
        }).join("")}
      </div>`;
  }).join("")}</div>`;
}

function renderAulas(doDia, minAgora) {
  const lista = doDia.filter((a) => !filtroTipo || a.categoria === filtroTipo);
  if (!lista.length) {
    $("aulas").innerHTML = `<p class="muted">Sem aulas${filtroTipo ? " deste tipo" : ""} neste dia.</p>`;
    return;
  }
  $("aulas").innerHTML = `<ul class="timeline">${lista.map((a) => {
    const ini = toMin(a.hora_inicio), fim = toMin(a.hora_fim);
    let estado = "";
    let cls = "";
    if (minAgora != null) {
      if (minAgora >= fim) { estado = "Terminada"; cls = "is-past"; }
      else if (minAgora >= ini) { estado = "A decorrer"; cls = "is-now"; }
      else if (ini - minAgora <= 60) estado = `Daqui a ${ini - minAgora} min`;
    }
    const p = profPorId(a.professor_id);
    const nomes = nomesDaAula(a);
    const apoio = a.categoria === "Apoio ao Estudo";
    return `
      <li class="timeline__item ${cls}">
        <div class="timeline__hora">${hhmm(a.hora_inicio)}<span class="muted">${hhmm(a.hora_fim)}</span></div>
        <div class="timeline__dot" style="background:${esc(p?.cor ?? "#ccc")}"></div>
        <div class="timeline__body">
          <div class="timeline__title">
            <strong>${esc(discPorId(a.disciplina_id)?.nome ?? a.categoria ?? "Aula")}</strong>
            ${a.categoria ? `<span class="badge ${apoio ? "badge--green" : "badge--yellow"}">${apoio ? "Apoio" : "Explicação"}</span>` : ""}
            ${estado ? `<span class="badge ${cls === "is-now" ? "badge--pink" : ""}">${estado}</span>` : ""}
          </div>
          <div class="small">${[
            salaPorId(a.sala_id) ? esc(salaPorId(a.sala_id).nome) : null,
            p ? `<strong>${esc(profCurto(p))}</strong>` : null,
          ].filter(Boolean).join(" · ")}</div>
          <div class="small muted">${nomes.length ? (apoio ? `${nomes.length} alunos: ` : "") + nomes.map((n) => esc(n)).join(", ") : "Sem alunos"}</div>
        </div>
      </li>`;
  }).join("")}</ul>`;
}

function renderAlertas(doDia) {
  const idsHoje = new Set(doDia.flatMap((a) => a.alunos));
  const doDiaAlunos = alunos.filter((a) => idsHoje.has(a.id)).sort((x, y) => x.nome.localeCompare(y.nome, "pt"));
  const saude = doDiaAlunos.filter((a) => temSaude(a.saude));
  const semSaida = doDiaAlunos.filter((a) => a.autoriza_saida === false);
  const semProf = doDia.filter((a) => !a.professor_id && a.categoria === "Explicação");
  const semSala = doDia.filter((a) => !a.sala_id);
  const nPorAssociar = doDia.reduce((t, a) => t + porAssociar(a).length, 0);

  const blocos = [];
  if (saude.length) blocos.push(`
    <div class="alerta">
      <div class="alerta__titulo">Saúde / alergias <span class="muted">(${saude.length})</span></div>
      <ul>${saude.map((a) => `<li><strong>${esc(nomeAluno(a))}</strong><br><span class="small">${esc(a.saude)}</span></li>`).join("")}</ul>
    </div>`);
  if (semSaida.length) blocos.push(`
    <div class="alerta">
      <div class="alerta__titulo">Sem autorização para sair <span class="muted">(${semSaida.length})</span></div>
      <ul>${semSaida.map((a) => `<li>${esc(nomeAluno(a))}</li>`).join("")}</ul>
    </div>`);
  if (semProf.length || semSala.length || nPorAssociar) blocos.push(`
    <div class="alerta alerta--leve">
      <div class="alerta__titulo">Horário</div>
      <ul>
        ${semProf.length ? `<li>${semProf.length} explicação(ões) sem professor</li>` : ""}
        ${semSala.length ? `<li>${semSala.length} aula(s) sem sala</li>` : ""}
        ${nPorAssociar ? `<li>${nPorAssociar} nome(s) de alunos por associar à ficha</li>` : ""}
      </ul>
    </div>`);
  $("alertas").innerHTML = blocos.join("") || `<p class="muted">Nada a assinalar.</p>`;
}

function renderAniversarios(agora) {
  const hoje0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const proximos = alunos
    .filter((a) => a.ativo && a.data_nascimento)
    .map((a) => {
      const [y, m, d] = a.data_nascimento.split("-").map(Number);
      let data = new Date(hoje0.getFullYear(), m - 1, d);
      if (data < hoje0) data = new Date(hoje0.getFullYear() + 1, m - 1, d);
      const dias = Math.round((data - hoje0) / 86400000);
      return { a, dias, idade: data.getFullYear() - y, data };
    })
    .filter((x) => x.dias <= 7)
    .sort((x, y) => x.dias - y.dias || x.a.nome.localeCompare(y.a.nome, "pt"));

  $("aniversarios").innerHTML = proximos.length
    ? `<ul class="lista-simples">${proximos.map(({ a, dias, idade, data }) => `
        <li>
          <span><strong>${esc(nomeAluno(a))}</strong> <span class="muted small">faz ${idade}</span></span>
          <span class="badge ${dias === 0 ? "badge--pink" : ""}">${dias === 0 ? "Hoje" : dias === 1 ? "Amanhã" : `${data.getDate()}/${data.getMonth() + 1}`}</span>
        </li>`).join("")}</ul>`
    : `<p class="muted">Nenhum nos próximos 7 dias.</p>`;
}

function renderMensalidades(agora) {
  const mes = inicioMes(agora);
  if (mensalidades === null) {
    $("mensalidades").innerHTML = `<p class="muted small">Corre a migração 007 no Supabase para ativar as mensalidades.</p>`;
    return;
  }
  if (!mensalidades.length) {
    $("mensalidades").innerHTML = `<p class="muted">Ainda não foram geradas as mensalidades de ${nomeMes(mes)}.</p>
      <a class="btn btn--ghost btn--sm" href="mensalidades.html">Gerar</a>`;
    return;
  }
  const contam = mensalidades.filter((m) => m.estado !== "Isento");
  const pagas = contam.filter((m) => m.estado === "Pago").length;
  const previsto = cent(contam.reduce((t, m) => t + Number(m.total), 0));
  const recebido = cent(contam.reduce((t, m) =>
    t + (m.estado === "Pago" ? Number(m.total) : m.estado === "Parcial" ? Number(m.valor_pago ?? 0) : 0), 0));
  const atraso = agora.getDate() > DIA_LIMITE ? contam.filter((m) => m.estado === "Por pagar") : [];
  const pct = previsto ? Math.round((recebido / previsto) * 100) : 0;

  $("mensalidades").innerHTML = `
    <div class="small">${nomeMes(mes)}: <strong>${pagas}</strong> de ${contam.length} pagas</div>
    <div class="barra" aria-label="${pct}% recebido"><span style="width:${pct}%"></span></div>
    <div class="small">${euro(recebido)} recebidos de ${euro(previsto)}</div>
    ${atraso.length ? `
      <div class="alerta" style="margin-top:12px">
        <div class="alerta__titulo">Em atraso <span class="muted">(${atraso.length})</span></div>
        <ul>${atraso.slice(0, 6).map((m) => `<li>${esc(nomeAluno(alunoPorId(m.aluno_id)) || "—")} · ${euro(m.total)}</li>`).join("")}
        ${atraso.length > 6 ? `<li class="muted">e mais ${atraso.length - 6}…</li>` : ""}</ul>
      </div>` : ""}`;
}

// ---------- Interação ----------

document.querySelectorAll(".segmented [data-tipo]").forEach((b) =>
  b.addEventListener("click", () => {
    filtroTipo = b.dataset.tipo;
    document.querySelectorAll(".segmented [data-tipo]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    render();
  })
);

// Atualiza "agora" a cada minuto e os dados a cada 5 minutos.
setInterval(render, 60 * 1000);
setInterval(carregar, 5 * 60 * 1000);

carregar();
