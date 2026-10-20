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
  { href: "horario.html", label: "Horário" },
  { href: "alunos.html", label: "Alunos" },
  { href: "professores.html", label: "Professores" },
];

/** Garante sessão iniciada; se não houver, volta ao login. Devolve o utilizador. */
export async function requireAuth() {
  const { data } = await sb.auth.getSession();
  if (!data.session) {
    window.location.replace("index.html");
    return new Promise(() => {}); // pára a execução da página
  }
  sb.auth.onAuthStateChange((event, session) => {
    if (!session) window.location.replace("index.html");
  });
  renderHeader(data.session.user);
  return data.session.user;
}

function renderHeader(user) {
  const here = location.pathname.split("/").pop() || "horario.html";
  const header = document.createElement("header");
  header.className = "app-header";
  header.innerHTML = `
    <div class="app-header__inner">
      <a class="brand" href="horario.html">
        <img src="assets/badge.png" alt="" />
        <span class="brand__text">
          <span class="brand__title">ADN Ensinar</span>
          <span class="brand__sub">Gestão</span>
        </span>
      </a>
      <nav class="nav" aria-label="Navegação principal">
        ${NAV.map((n) => `<a href="${n.href}" ${n.href === here ? 'aria-current="page"' : ""}>${n.label}</a>`).join("")}
      </nav>
      <div class="header-user">
        <span class="header-user__email">${esc(user.email)}</span>
        <button class="btn btn--ghost btn--sm" id="logout">Sair</button>
      </div>
    </div>`;
  document.body.prepend(header);
  header.querySelector("#logout").addEventListener("click", async () => {
    await sb.auth.signOut();
    window.location.replace("index.html");
  });
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
