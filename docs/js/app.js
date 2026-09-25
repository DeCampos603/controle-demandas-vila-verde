import { CONFIG, LISTAS } from "./config.js";
import * as api from "./api.js";

const $ = (id) => document.getElementById(id);
const estado = { demandas: [], filtro: { busca: "", status: "", prioridade: "", categoria: "", ordem: "prioridade" }, vista: "tabela", editando: null, ocupado: false };

/* ---------- utilidades ---------- */
const nivel = (p) => (p || "").startsWith("Nível 1") ? 1 : (p || "").startsWith("Nível 2") ? 2 : 3;
const fmtData = (iso) => {
  if (!iso) return "–";
  const d = new Date(iso);
  return isNaN(d) ? "–" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else e.setAttribute(k, v === true ? "" : v);
  }
  filhos.flat().forEach((f) => f != null && e.append(f));
  return e;
}
const classeStatus = (s) => ({ "A começar": "sa", "Em andamento": "se", "Pendência": "sp", "Finalizado": "sf" }[s] || "sa");
const simboloStatus = (s) => ({ "A começar": "○", "Em andamento": "◐", "Pendência": "⏸", "Finalizado": "✔" }[s] || "○");
const simboloPrio = (n) => (n === 1 ? "▲" : n === 2 ? "■" : "▼");

const seloPrioridade = (p) => el("span", { class: "selo selo--p" + nivel(p), text: simboloPrio(nivel(p)) + " " + p });
const seloStatus = (s) => el("span", { class: "selo selo--" + classeStatus(s), text: simboloStatus(s) + " " + s });
const seloRisco = (r) => el("span", { class: "selo selo--risco", text: r || "–" });

let temporizadorToast;
function aviso(msg, erro = false) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast" + (erro ? " toast--erro" : "");
  t.hidden = false;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => (t.hidden = true), erro ? 6000 : 3200);
}

function estadoSinc(tipo, texto) {
  $("sinc").dataset.estado = tipo;
  $("sinc-texto").textContent = texto;
}

/* ---------- KPIs ---------- */
function calcularKpis() {
  const l = estado.demandas;
  const ativas = l.filter((d) => d.status !== "Finalizado");
  const agora = new Date();
  const doMes = l.filter((d) => {
    if (d.status !== "Finalizado" || !d.concluido_em) return false;
    const c = new Date(d.concluido_em);
    return c.getMonth() === agora.getMonth() && c.getFullYear() === agora.getFullYear();
  });
  const resolvidas = l.filter((d) => d.status === "Finalizado" && d.concluido_em && d.aberto_em);
  const dias = resolvidas.length ? resolvidas.reduce((s, d) => s + (new Date(d.concluido_em) - new Date(d.aberto_em)), 0) / resolvidas.length / 86400000 : null;
  $("kpi-ativas").textContent = ativas.length;
  $("kpi-criticas").textContent = ativas.filter((d) => nivel(d.prioridade) === 1).length;
  $("kpi-mes").textContent = doMes.length;
  $("kpi-mes-nome").textContent = agora.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  $("kpi-tempo").textContent = dias == null ? "–" : (dias < 1 ? "<1 dia" : dias.toFixed(1).replace(".", ",") + " dias");
}

/* ---------- filtro e ordenação ---------- */
function filtradas() {
  const f = estado.filtro;
  const q = semAcento(f.busca);
  let l = estado.demandas.filter((d) =>
    (!f.status || d.status === f.status) && (!f.prioridade || d.prioridade === f.prioridade) && (!f.categoria || d.categoria === f.categoria) &&
    (!q || semAcento([d.protocolo, d.escopo, d.local_pnr, d.beneficio, d.despacho, d.risco].join(" ")).includes(q)));
  const porData = (campo, dir) => (a, b) => dir * (new Date(a[campo]) - new Date(b[campo]));
  if (f.ordem === "recentes") l.sort(porData("aberto_em", -1));
  else if (f.ordem === "antigas") l.sort(porData("aberto_em", 1));
  else if (f.ordem === "atualizadas") l.sort(porData("atualizado_em", 1));
  else l.sort((a, b) => nivel(a.prioridade) - nivel(b.prioridade) || (a.status === "Finalizado") - (b.status === "Finalizado") || new Date(b.aberto_em) - new Date(a.aberto_em));
  return l;
}

/* ---------- renderização ---------- */
function celula(rot, ...filhos) { return el("td", { "data-rot": rot }, ...filhos); }

function linhaTabela(d) {
  const tr = el("tr", { tabindex: "0", "data-p": nivel(d.prioridade), "aria-label": "Abrir demanda " + d.protocolo });
  tr.append(
    celula("Protocolo", el("span", { class: "proto", text: d.protocolo })),
    celula("Abertura / Atualização", el("span", { class: "data", text: "Aberta " + fmtData(d.aberto_em) }), el("br"), el("span", { class: "data", text: "Atual. " + fmtData(d.atualizado_em) })),
    celula("Categoria", d.categoria),
    celula("Escopo", d.local_pnr ? el("span", { class: "local", text: d.local_pnr }) : null, el("span", { class: "corta", text: d.escopo })),
    celula("Prioridade", seloPrioridade(d.prioridade)),
    celula("Risco", seloRisco(d.risco)),
    celula("Benefício direto", d.beneficio ? el("span", { class: "corta", text: d.beneficio }) : el("span", { class: "muted", text: "–" })),
    celula("Despacho institucional", d.despacho ? el("span", { class: "corta", text: d.despacho }) : el("span", { class: "muted", text: "Sem despacho" })),
    celula("Status", seloStatus(d.status), d.status === "Pendência" && d.pendencia_motivo ? el("span", { class: "pend", text: d.pendencia_motivo }) : null),
  );
  const abrir = () => abrirForm(d.protocolo);
  tr.addEventListener("click", abrir);
  tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); } });
  return tr;
}

function cartaoKanban(d) {
  const sel = el("select", { "aria-label": "Mover " + d.protocolo + " para" });
  LISTAS.status.forEach((s) => sel.append(el("option", { value: s, text: s, selected: s === d.status })));
  sel.addEventListener("change", () => mudarStatus(d, sel.value, sel));
  const c = el("article", { class: "cartao", draggable: "true", "data-p": nivel(d.prioridade), "data-id": d.protocolo },
    el("div", { class: "cartao__topo" }, el("button", { type: "button", class: "cartao__abrir", text: d.protocolo }), seloPrioridade(d.prioridade)),
    d.local_pnr ? el("span", { class: "local", text: d.local_pnr }) : null,
    el("p", { class: "corta", text: d.escopo }),
    el("div", {}, el("span", { class: "muted", text: d.categoria + " · " }), seloRisco(d.risco)),
    d.status === "Pendência" && d.pendencia_motivo ? el("span", { class: "pend", text: d.pendencia_motivo }) : null,
    el("div", { class: "cartao__mover" }, sel),
  );
  c.querySelector(".cartao__abrir").addEventListener("click", () => abrirForm(d.protocolo));
  c.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", d.protocolo); e.dataTransfer.effectAllowed = "move"; c.classList.add("arrastando"); });
  c.addEventListener("dragend", () => c.classList.remove("arrastando"));
  return c;
}

function renderKanban(lista) {
  const cont = $("vista-kanban");
  cont.replaceChildren();
  LISTAS.status.forEach((s) => {
    const itens = lista.filter((d) => d.status === s);
    const col = el("div", { class: "col", "data-status": s }, el("div", { class: "col__cab" }, el("span", { text: simboloStatus(s) + " " + s }), el("span", { class: "col__n", text: itens.length })));
    itens.forEach((d) => col.append(cartaoKanban(d)));
    col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("sobre"); });
    col.addEventListener("dragleave", () => col.classList.remove("sobre"));
    col.addEventListener("drop", (e) => {
      e.preventDefault();
      col.classList.remove("sobre");
      const d = estado.demandas.find((x) => x.protocolo === e.dataTransfer.getData("text/plain"));
      if (d && d.status !== s) mudarStatus(d, s);
    });
    cont.append(col);
  });
}

function render() {
  calcularKpis();
  const lista = filtradas();
  const corpo = $("corpo");
  corpo.replaceChildren(...lista.map(linhaTabela));
  renderKanban(lista);
  $("vazio").hidden = lista.length > 0;
  $("vista-tabela").hidden = estado.vista !== "tabela";
  $("vista-kanban").hidden = estado.vista !== "kanban";
  const filtrando = lista.length !== estado.demandas.length;
  $("contagem").textContent = `Exibindo ${lista.length} de ${estado.demandas.length} demanda(s)` + (filtrando ? " — filtros ativos." : ".");
}

/* ---------- carregamento ---------- */
async function carregar(silencioso = false) {
  if (!silencioso) estadoSinc("carregando", api.modoDemo ? "Modo demonstração" : "Lendo a planilha…");
  try {
    estado.demandas = await api.listar();
    $("aviso-erro").hidden = true;
    estadoSinc(api.modoDemo ? "demo" : "ok", api.modoDemo ? "Modo demonstração" : "Planilha sincronizada · " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
  } catch (e) {
    if (e.cache) estado.demandas = e.cache;
    estadoSinc("erro", "Sem conexão com a planilha");
    const av = $("aviso-erro");
    av.textContent = e.message + (e.cache ? " Exibindo a última leitura salva neste aparelho — alterações estão bloqueadas até reconectar." : "");
    av.hidden = false;
  }
  render();
}

/* ---------- gravação ---------- */
async function executar(fn, msgOk) {
  if (estado.ocupado) return false;
  estado.ocupado = true;
  estadoSinc("carregando", api.modoDemo ? "Modo demonstração" : "Gravando na planilha…");
  try {
    await fn();
    await carregar(true);
    aviso(msgOk);
    return true;
  } catch (e) {
    estadoSinc("erro", "Falha ao gravar");
    aviso(e.message, true);
    render();
    return false;
  } finally {
    estado.ocupado = false;
  }
}

function mudarStatus(d, novo, seletor) {
  if (novo === "Pendência" && !d.pendencia_motivo) {
    abrirForm(d.protocolo, { status: novo });
    aviso("Informe o motivo da pendência para concluir a mudança.");
    return;
  }
  executar(() => api.atualizar(d.protocolo, { status: novo }), d.protocolo + " → " + novo).then((ok) => { if (!ok && seletor) seletor.value = d.status; });
}

/* ---------- formulário ---------- */
const CAMPOS = ["categoria", "local_pnr", "escopo", "prioridade", "risco", "beneficio", "despacho", "status", "pendencia_motivo"];
const campo = (k) => $("c-" + k);

function preencherSelect(sel, opcoes, primeira) {
  sel.replaceChildren(...(primeira != null ? [el("option", { value: "", text: primeira })] : []), ...opcoes.map((o) => el("option", { value: o, text: o })));
}

function limparErros() {
  document.querySelectorAll("[data-erro]").forEach((s) => (s.textContent = ""));
  document.querySelectorAll(".campo.invalido").forEach((c) => c.classList.remove("invalido"));
  $("erro-form").textContent = "";
}
function marcarErro(chave, msg) {
  const s = document.querySelector(`[data-erro="${chave}"]`);
  if (s) s.textContent = msg;
  const c = campo(chave);
  if (c) c.closest(".campo").classList.add("invalido");
}

function validar() {
  limparErros();
  let primeiro = null;
  const obrig = { categoria: "Escolha a categoria.", escopo: "Descreva o escopo.", prioridade: "Escolha a prioridade.", risco: "Escolha a matriz de risco." };
  for (const [k, m] of Object.entries(obrig)) if (!campo(k).value.trim()) { marcarErro(k, m); primeiro = primeiro || campo(k); }
  if (campo("status").value === "Pendência" && !campo("pendencia_motivo").value.trim()) { marcarErro("pendencia_motivo", "Informe o motivo da pendência."); primeiro = primeiro || campo("pendencia_motivo"); }
  if (primeiro) primeiro.focus();
  return !primeiro;
}

function atualizarPendencia() { $("grupo-pendencia").hidden = campo("status").value !== "Pendência"; }

async function abrirForm(protocolo, sobrepor = {}) {
  const dlg = $("dlg-form");
  limparErros();
  estado.editando = protocolo || null;
  const d = protocolo ? estado.demandas.find((x) => x.protocolo === protocolo) : null;
  if (protocolo && !d) return;
  $("dlg-titulo").textContent = d ? "Demanda" : "Nova demanda";
  const base = d || { categoria: "", local_pnr: "", escopo: "", prioridade: "", risco: "Nenhum", beneficio: "", despacho: "", status: "A começar", pendencia_motivo: "" };
  CAMPOS.forEach((k) => (campo(k).value = sobrepor[k] ?? base[k] ?? ""));
  atualizarPendencia();
  const p = $("dlg-protocolo");
  p.hidden = !d;
  if (d) p.replaceChildren(d.protocolo, el("span", { text: "Aberta em " + fmtData(d.aberto_em) + " · Atualizada em " + fmtData(d.atualizado_em) + (d.concluido_em ? " · Concluída em " + fmtData(d.concluido_em) : "") }));
  $("bt-excluir").hidden = !d;
  $("hist").hidden = true;
  const somenteLeitura = !!d && !api.modoDemo && $("sinc").dataset.estado === "erro";
  $("bt-salvar").disabled = somenteLeitura;
  dlg.showModal();
  if (d && !api.modoDemo) {
    try {
      const h = await api.historico(d.protocolo);
      if (h.length && estado.editando === protocolo) {
        $("hist-lista").replaceChildren(...h.map((x) => el("li", { text: `${fmtData(x.quando)} — ${x.acao}${x.campo ? " · " + x.campo + ": " + (x.de || "vazio") + " → " + (x.para || "vazio") : ""}` })));
        $("hist").hidden = false;
      }
    } catch { /* histórico é opcional */ }
  }
}

function fecharForm() { $("dlg-form").close(); estado.editando = null; }

async function salvar(ev) {
  ev.preventDefault();
  if (!validar()) return;
  const dados = {};
  CAMPOS.forEach((k) => (dados[k] = campo(k).value.trim()));
  if (dados.status !== "Pendência") dados.pendencia_motivo = "";
  const botao = $("bt-salvar");
  botao.disabled = true;
  const criando = !estado.editando;
  const ok = await executar(() => (criando ? api.criar(dados) : api.atualizar(estado.editando, dados)), criando ? "Demanda registrada na planilha." : "Alterações gravadas na planilha.");
  botao.disabled = false;
  if (ok) fecharForm(); else $("erro-form").textContent = "Não foi possível gravar. Verifique a conexão e tente de novo.";
}

function pedirExclusao() {
  const p = estado.editando;
  $("conf-texto").textContent = `A demanda ${p} será removida da lista. Na planilha ela fica marcada como excluída e o histórico é preservado.`;
  $("dlg-conf").showModal();
}

/* ---------- exportação ---------- */
function descricaoFiltros() {
  const f = estado.filtro;
  const partes = [f.status && "Status: " + f.status, f.prioridade && "Prioridade: " + f.prioridade, f.categoria && "Categoria: " + f.categoria, f.busca && "Busca: “" + f.busca + "”"].filter(Boolean);
  return partes.length ? "Filtros: " + partes.join(" · ") : "Filtros: nenhum (todas as demandas)";
}
function exportarPdf() {
  $("imp-titulo").textContent = CONFIG.NOME_LOCAL + " — Relatório de Demandas";
  $("imp-sub").textContent = CONFIG.SUBTITULO + " · Emitido em " + fmtData(new Date().toISOString());
  $("imp-filtros").textContent = descricaoFiltros() + " · " + filtradas().length + " demanda(s)";
  window.print();
}
function exportarCsv() {
  const cols = [["protocolo", "Protocolo"], ["aberto_em", "Abertura"], ["atualizado_em", "Atualização"], ["concluido_em", "Conclusão"], ["categoria", "Categoria"], ["local_pnr", "Local"], ["escopo", "Escopo"], ["prioridade", "Prioridade"], ["risco", "Risco"], ["beneficio", "Benefício"], ["despacho", "Despacho"], ["status", "Status"], ["pendencia_motivo", "Motivo da pendência"]];
  const esc = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita fórmula ao abrir no Excel
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const linhas = [cols.map((c) => esc(c[1])).join(";"), ...filtradas().map((d) => cols.map((c) => esc(d[c[0]])).join(";"))];
  const blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = el("a", { href: URL.createObjectURL(blob), download: "demandas-vila-verde-" + new Date().toISOString().slice(0, 10) + ".csv" });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- inicialização ---------- */
function definirVista(v) {
  estado.vista = v;
  $("v-tabela").setAttribute("aria-pressed", String(v === "tabela"));
  $("v-kanban").setAttribute("aria-pressed", String(v === "kanban"));
  render();
}

function lerUrl() {
  const p = new URLSearchParams(location.search);
  ["status", "prioridade", "categoria"].forEach((k) => { if (p.get(k)) estado.filtro[k] = p.get(k); });
  if (p.get("q")) estado.filtro.busca = p.get("q");
  if (p.get("vista") === "kanban") estado.vista = "kanban";
}
function gravarUrl() {
  const p = new URLSearchParams();
  const f = estado.filtro;
  if (f.status) p.set("status", f.status);
  if (f.prioridade) p.set("prioridade", f.prioridade);
  if (f.categoria) p.set("categoria", f.categoria);
  if (f.busca) p.set("q", f.busca);
  if (estado.vista === "kanban") p.set("vista", "kanban");
  history.replaceState(null, "", p.toString() ? "?" + p : location.pathname);
}

function iniciar() {
  $("titulo-local").textContent = CONFIG.NOME_LOCAL;
  $("subtitulo-local").textContent = CONFIG.SUBTITULO;
  $("aviso-demo").hidden = !api.modoDemo;

  preencherSelect($("f-status"), LISTAS.status, "Todos");
  preencherSelect($("f-prioridade"), LISTAS.prioridade, "Todas");
  preencherSelect($("f-categoria"), LISTAS.categoria, "Todas");
  preencherSelect(campo("categoria"), LISTAS.categoria, "Selecione…");
  preencherSelect(campo("prioridade"), LISTAS.prioridade, "Selecione…");
  preencherSelect(campo("risco"), LISTAS.risco);
  preencherSelect(campo("status"), LISTAS.status);

  lerUrl();
  $("f-busca").value = estado.filtro.busca;
  $("f-status").value = estado.filtro.status;
  $("f-prioridade").value = estado.filtro.prioridade;
  $("f-categoria").value = estado.filtro.categoria;
  $("v-tabela").setAttribute("aria-pressed", String(estado.vista === "tabela"));
  $("v-kanban").setAttribute("aria-pressed", String(estado.vista === "kanban"));

  const aoFiltrar = () => {
    estado.filtro = { busca: $("f-busca").value, status: $("f-status").value, prioridade: $("f-prioridade").value, categoria: $("f-categoria").value, ordem: $("f-ordem").value };
    gravarUrl();
    render();
  };
  ["f-busca", "f-status", "f-prioridade", "f-categoria", "f-ordem"].forEach((id) => $(id).addEventListener(id === "f-busca" ? "input" : "change", aoFiltrar));

  $("v-tabela").addEventListener("click", () => { definirVista("tabela"); gravarUrl(); });
  $("v-kanban").addEventListener("click", () => { definirVista("kanban"); gravarUrl(); });
  $("bt-nova").addEventListener("click", () => abrirForm(null));
  $("bt-pdf").addEventListener("click", exportarPdf);
  $("bt-csv").addEventListener("click", exportarCsv);
  $("form").addEventListener("submit", salvar);
  $("dlg-fechar").addEventListener("click", fecharForm);
  $("bt-cancelar").addEventListener("click", fecharForm);
  $("bt-excluir").addEventListener("click", pedirExclusao);
  $("conf-nao").addEventListener("click", () => $("dlg-conf").close());
  $("conf-sim").addEventListener("click", async () => {
    const p = estado.editando;
    $("dlg-conf").close();
    if (await executar(() => api.excluir(p), p + " excluída.")) fecharForm();
  });
  campo("status").addEventListener("change", atualizarPendencia);
  $("dlg-form").addEventListener("click", (e) => { if (e.target === $("dlg-form")) fecharForm(); });
  $("dlg-form").addEventListener("cancel", () => { estado.editando = null; });

  carregar();
  if (!api.modoDemo && CONFIG.ATUALIZAR_A_CADA_MS) {
    setInterval(() => { if (!document.hidden && !estado.ocupado && !$("dlg-form").open) carregar(true); }, CONFIG.ATUALIZAR_A_CADA_MS);
  }
  window.addEventListener("online", () => carregar());
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
}

iniciar();
