// ==========================================================================
// ADN Ensinar — Gestão · app.js
// Cliente Supabase, proteção das páginas (login obrigatório) e utilitários.
// ==========================================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Estas duas chaves são públicas por natureza. Os dados estão protegidos
// pelo login + regras de acesso (RLS) definidas em supabase/schema.sql.
const SUPABASE_URL = "https://ttnqlwpvrbzcqyqrbalz.supabase.co";
const SUPABASE_KEY = "sb_publishable_AVkYIS-2Vhr2k4rbUtSvQA_XiILmluK";

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const DIAS = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const DIAS_CURTOS = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export const ANOS = [
  "1.º ano", "2.º ano", "3.º ano", "4.º ano", "5.º ano", "6.º ano",
  "7.º ano", "8.º ano", "9.º ano", "10.º ano", "11.º ano", "12.º ano",
  "Ensino superior", "Outro",
];

export const CORES = ["#c1dbdc", "#cee3d1", "#ffe7a9", "#fbd1c1", "#d9d2ec", "#f3d1e4", "#d6e4f5", "#e8dcc8"];

// Header / navegação ------------------------------------------------

const NAV = [
  { href: "hoje.html", label: "Hoje" },
  { href: "horario.html", label: "Horário" },
  { href: "alunos.html", label: "Alunos" },
  { href: "mensalidades.html", label: "Mensalidades", acesso: "financas" },
  { href: "professores.html", label: "Configuração", grupo: "config", acesso: "admin" },
];

// Páginas dentro de "Configuração" (mostradas como separadores secundários)
const CONFIG = [
  { href: "professores.html", label: "Professores" },
  { href: "salas.html", label: "Salas" },
  { href: "disciplinas.html", label: "Disciplinas" },
  { href: "precos.html", label: "Preços" },
  { href: "utilizadores.html", label: "Utilizadores" },
  { href: "registo.html", label: "Registo de alterações" },
  { href: "backup.html", label: "Backup" },
];

// Quem pode abrir cada página (as regras reais estão na base de dados — isto só evita páginas vazias).
const ACESSO = {
  "mensalidades.html": "financas",
  "importar.html": "admin",
  ...Object.fromEntries(CONFIG.map((c) => [c.href, "admin"])),
};

/** Perfil de quem tem sessão iniciada: { admin, financas, nome, email }. */
export let perfil = { admin: false, financas: false, nome: "", email: "" };

async function carregarPerfil(user) {
  const { data, error } = await sb.from("utilizadores").select("*").eq("id", user.id).maybeSingle();
  if (error) {
    // Antes da migração 010 não há perfis: quem entra é a administração.
    if (/utilizadores|schema cache|does not exist/i.test(error.message)) {
      return { admin: true, financas: true, nome: "", email: user.email };
    }
    throw error;
  }
  if (!data || !data.ativo) return null;
  return {
    admin: data.perfil === "admin",
    financas: data.perfil === "admin" || data.ver_financas,
    nome: data.nome ?? "",
    email: user.email,
  };
}

const pode = (acesso) => !acesso || (acesso === "admin" ? perfil.admin : acesso === "financas" ? perfil.financas : true);

/** Garante sessão iniciada e permissão para a página; se não, volta ao login ou à página Hoje. */
export async function requireAuth() {
  const parar = () => new Promise(() => {}); // pára a execução da página
  const { data } = await sb.auth.getSession();
  if (!data.session) {
    window.location.replace("index.html");
    return parar();
  }
  const p = await carregarPerfil(data.session.user);
  if (!p) {
    await sb.auth.signOut();
    window.location.replace("index.html?sem-acesso=1");
    return parar();
  }
  perfil = p;
  const here = location.pathname.split("/").pop() || "hoje.html";
  if (!pode(ACESSO[here])) {
    window.location.replace("hoje.html");
    return parar();
  }
  sb.auth.onAuthStateChange((event, session) => {
    if (!session) window.location.replace("index.html");
  });
  document.body.classList.add(perfil.admin ? "perfil-admin" : "perfil-gestao");
  if (!perfil.financas) document.body.classList.add("sem-financas");
  renderHeader(data.session.user);
  return data.session.user;
}

function renderHeader(user) {
  const here = location.pathname.split("/").pop() || "hoje.html";
  const header = document.createElement("header");
  header.className = "app-header";
  header.innerHTML = `
    <div class="app-header__inner">
      <a class="brand" href="hoje.html">
        <img src="assets/badge.png" alt="" />
        <span class="brand__text">
          <span class="brand__title">ADN Ensinar</span>
          <span class="brand__sub">Gestão</span>
        </span>
      </a>
      <nav class="nav" aria-label="Navegação principal">
        ${NAV.filter((n) => pode(n.acesso)).map((n) => {
          const ativo = n.grupo === "config" ? CONFIG.some((c) => c.href === here) : n.href === here;
          return `<a href="${n.href}" ${ativo ? 'aria-current="page"' : ""}>${n.label}</a>`;
        }).join("")}
      </nav>
      <div class="header-user">
        <button type="button" class="header-user__email link-conta" id="conta" title="Mudar a minha password">${esc(perfil.nome || user.email)}</button>
        <span class="badge ${perfil.admin ? "" : "badge--green"}">${perfil.admin ? "Admin" : "Gestão"}</span>
        <button class="btn btn--ghost btn--sm" id="logout">Sair</button>
      </div>
    </div>`;
  document.body.prepend(header);

  if (CONFIG.some((c) => c.href === here)) {
    const sub = document.createElement("nav");
    sub.className = "subnav";
    sub.setAttribute("aria-label", "Configuração");
    sub.innerHTML = CONFIG.map((c) => `<a href="${c.href}" ${c.href === here ? 'aria-current="page"' : ""}>${c.label}</a>`).join("");
    document.querySelector("main.page")?.prepend(sub);
  }
  header.querySelector("#logout").addEventListener("click", async () => {
    await sb.auth.signOut();
    window.location.replace("index.html");
  });
  header.querySelector("#conta").addEventListener("click", abrirConta);
}

/** Pequena janela para cada pessoa mudar a sua password. */
function abrirConta() {
  let d = document.getElementById("dlg-conta");
  if (!d) {
    d = document.createElement("dialog");
    d.id = "dlg-conta";
    d.className = "modal";
    d.innerHTML = `
      <form method="dialog" novalidate>
        <div class="modal__head">
          <h2>A minha conta</h2>
          <button type="button" class="modal__close" data-close aria-label="Fechar">×</button>
        </div>
        <div class="modal__body">
          <p class="muted small" style="margin-top:0">${esc(perfil.email)}</p>
          <div class="form-grid">
            <div class="field">
              <label for="pw1">Nova password</label>
              <input class="input" id="pw1" type="password" autocomplete="new-password" minlength="8" />
            </div>
            <div class="field">
              <label for="pw2">Repetir</label>
              <input class="input" id="pw2" type="password" autocomplete="new-password" />
            </div>
          </div>
          <p class="small muted">Mínimo 8 caracteres.</p>
        </div>
        <div class="modal__foot">
          <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
          <button type="submit" class="btn">Guardar password</button>
        </div>
      </form>`;
    document.body.appendChild(d);
    wireModal(d);
    d.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const a = d.querySelector("#pw1").value, b = d.querySelector("#pw2").value;
      if (a.length < 8) return toast("A password tem de ter pelo menos 8 caracteres.", true);
      if (a !== b) return toast("As passwords não coincidem.", true);
      const { error } = await sb.auth.updateUser({ password: a });
      if (failed(error, "Não foi possível mudar a password")) return;
      d.close();
      toast("Password alterada.");
    });
  }
  d.querySelector("form").reset();
  d.showModal();
}

// Utilitários --------------------------------------------------------------

/** Escapa texto para inserir em HTML (evita injeção de código). */
export function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** "14:30:00" → "14:30" */
export const hhmm = (t) => (t ? String(t).slice(0, 5) : "");

/** "14:30" → minutos desde as 00:00 */
export const toMin = (t) => {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
};

export function toast(msg, isError = false) {
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " toast--error" : "");
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), isError ? 5000 : 2500);
}

/** Mostra o erro do Supabase de forma legível e devolve true se houve erro. */
export function failed(error, contexto = "Ocorreu um erro") {
  if (!error) return false;
  console.error(error);
  toast(`${contexto}: ${error.message}`, true);
  return true;
}

/** Normaliza texto para pesquisa (sem acentos, minúsculas). */
export const norm = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Lê os campos de um <form> para um objeto, convertendo vazios em null. */
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.type === "submit" || el.type === "button") continue;
    if (el.type === "checkbox" && !el.dataset.multi) out[el.name] = el.checked;
    else if (el.type === "radio") { if (el.checked) out[el.name] = el.value; }
    else if (!el.dataset.multi) out[el.name] = el.value.trim() === "" ? null : el.value.trim();
  }
  return out;
}

/** Preenche os campos de um <form> a partir de um objeto. */
export function fillForm(form, obj = {}) {
  for (const el of form.elements) {
    if (!el.name || el.dataset.multi) continue;
    const v = obj[el.name];
    if (el.type === "checkbox") el.checked = v ?? el.defaultChecked;
    else if (el.type === "radio") el.checked = v != null ? el.value === v : el.defaultChecked;
    else if (el.type === "time") el.value = v ? hhmm(v) : "";
    else if (el.type === "date") el.value = v ? String(v).slice(0, 10) : "";
    else el.value = v ?? "";
  }
}

/** Liga o botão × e o clique fora ao fecho do <dialog>. */
export function wireModal(dialog) {
  dialog.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", () => dialog.close())
  );
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
}


// Ordenação de tabelas -------------------------------------------------------

const coll = new Intl.Collator("pt", { sensitivity: "base", numeric: true });

/** Ordena uma lista pela chave escolhida. `chaves` = { chave: (linha) => valor }. */
export function ordenar(lista, estado, chaves) {
  const f = chaves[estado.chave];
  if (!f) return lista;
  const dir = estado.dir === "desc" ? -1 : 1;
  return [...lista].sort((a, b) => {
    const x = f(a), y = f(b);
    const vx = x == null || x === "", vy = y == null || y === "";
    if (vx || vy) return vx === vy ? 0 : vx ? 1 : -1; // vazios sempre no fim
    if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
    if (typeof x === "boolean") return (Number(x) - Number(y)) * dir;
    return coll.compare(String(x), String(y)) * dir;
  });
}

/**
 * Liga a ordenação a uma tabela: clicar num <th data-sort="chave"> ordena por essa coluna
 * (2.º clique inverte) e um <select> opcional com valores "chave:asc|desc" (ex.: "recente:desc").
 */
export function ligarOrdenacao(tabela, select, estado, aoMudar) {
  const marcar = () => {
    tabela.querySelectorAll("th[data-sort]").forEach((th) => {
      th.setAttribute("aria-sort", th.dataset.sort === estado.chave ? (estado.dir === "asc" ? "ascending" : "descending") : "none");
    });
    if (select) {
      const v = `${estado.chave}:${estado.dir}`;
      select.value = [...select.options].some((o) => o.value === v) ? v : "";
    }
  };
  tabela.querySelectorAll("th[data-sort]").forEach((th) => {
    th.tabIndex = 0;
    const clicar = () => {
      if (estado.chave === th.dataset.sort) estado.dir = estado.dir === "asc" ? "desc" : "asc";
      else { estado.chave = th.dataset.sort; estado.dir = th.dataset.dir ?? "asc"; }
      marcar();
      aoMudar();
    };
    th.addEventListener("click", clicar);
    th.addEventListener("keydown", (e) => { if (e.key === "Enter") clicar(); });
  });
  select?.addEventListener("change", () => {
    if (!select.value) return;
    const [chave, dir] = select.value.split(":");
    Object.assign(estado, { chave, dir });
    marcar();
    aoMudar();
  });
  marcar();
}


// Dinheiro, datas e níveis -----------------------------------------------------

const fmtEuro = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
/** 12.5 → "12,50 €" */
export const euro = (v) => fmtEuro.format(Number(v ?? 0));

/** Arredonda a cêntimos. */
export const cent = (v) => Math.round(Number(v ?? 0) * 100) / 100;

export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Date → "2026-10-01" (1.º dia do mês, sem fuso horário). */
export const inicioMes = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;

/** Date → "2026-10-22" (data local). */
export const isoLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "2026-10-01" → "outubro de 2026" */
export const nomeMes = (iso) => {
  const [a, m] = String(iso).split("-").map(Number);
  return `${MESES[m - 1]} de ${a}`;
};

/** Ano letivo (setembro a agosto) a que pertence um mês "AAAA-MM-01" → "2026/2027". */
export const anoLetivo = (iso) => {
  const [a, m] = String(iso).split("-").map(Number);
  return m >= 9 ? `${a}/${a + 1}` : `${a - 1}/${a}`;
};

/** "7.º ano" → "3.º ciclo" (para escolher o preço certo). */
export function nivelDoAno(ano) {
  const n = Number(String(ano ?? "").match(/\d+/)?.[0]);
  if (!n) return null;
  if (n <= 4) return "1.º ciclo";
  if (n <= 6) return "2.º ciclo";
  if (n <= 9) return "3.º ciclo";
  if (n <= 12) return "Secundário";
  return null;
}

// Ligações muitos-para-muitos -------------------------------------------------

/**
 * Acerta as ligações de um registo (ex.: disciplinas de um aluno) apagando só as que
 * saíram e inserindo só as novas — assim o registo de alterações mostra o que mudou.
 */
export async function sincronizar(tabela, campoDono, idDono, campoOutro, novosIds) {
  const { data, error } = await sb.from(tabela).select(campoOutro).eq(campoDono, idDono);
  if (error) return error;
  const atuais = new Set(data.map((r) => r[campoOutro]));
  const novos = new Set(novosIds);
  const sair = [...atuais].filter((x) => !novos.has(x));
  const entrar = [...novos].filter((x) => !atuais.has(x));
  if (sair.length) {
    const { error: e } = await sb.from(tabela).delete().eq(campoDono, idDono).in(campoOutro, sair);
    if (e) return e;
  }
  if (entrar.length) {
    const { error: e } = await sb.from(tabela).insert(entrar.map((x) => ({ [campoDono]: idDono, [campoOutro]: x })));
    if (e) return e;
  }
  return null;
}


// Nomes dos alunos ---------------------------------------------------------------

/**
 * Nome a mostrar: o nome comum (ou o primeiro nome) + o apelido.
 * "José André Silva" com nome comum "André" → "André Silva".
 */
export function nomeAluno(a) {
  if (!a?.nome) return "";
  const w = String(a.nome).trim().split(/\s+/);
  const apelido = w.length > 1 ? w[w.length - 1] : "";
  const comum = String(a.nome_comum ?? "").trim();
  if (!comum) return [w[0], apelido].filter(Boolean).join(" ");
  // Se o nome comum já termina no apelido (ex.: "Zé Silva"), não o repete.
  if (apelido && norm(comum).split(/\s+/).pop() === norm(apelido)) return comum;
  return [comum, apelido].filter(Boolean).join(" ");
}

/** Texto para pesquisa: nome completo + nome comum. */
export const textoAluno = (a) => `${a?.nome ?? ""} ${a?.nome_comum ?? ""}`;
