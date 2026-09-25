/* Camada de dados. Com API_URL preenchida, toda gravação vai para a planilha
   (Google Apps Script) e só é refletida na tela depois que a planilha confirma.
   Sem API_URL, funciona em modo demonstração sobre o localStorage. */
import { CONFIG } from "./config.js";

export const modoDemo = !CONFIG.API_URL;
const CHAVE_DEMO = "vv-demo-v1";
const CHAVE_CACHE = "vv-cache-v1";

async function requisitar(url, opcoes) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch(url, { ...opcoes, signal: ctl.signal, redirect: "follow" });
    if (!r.ok) throw new Error("Falha de comunicação (" + r.status + ").");
    const j = await r.json();
    if (!j.ok) throw new Error(j.erro || "Erro no servidor.");
    return j;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("A planilha demorou demais para responder.");
    if (e instanceof TypeError) throw new Error("Sem conexão com a planilha.");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

// text/plain evita o pré-voo CORS, que o Apps Script não responde.
const postar = (corpo) =>
  requisitar(CONFIG.API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(corpo) });

/* ---------- modo demonstração ---------- */

const agoraISO = () => new Date().toISOString();

function amostra() {
  const d = (dias) => new Date(Date.now() - dias * 86400000).toISOString();
  const ym = (dias) => { const x = new Date(Date.now() - dias * 86400000); return "#" + x.getFullYear() + String(x.getMonth() + 1).padStart(2, "0"); };
  return [
    { protocolo: ym(20) + "-001", aberto_em: d(20), atualizado_em: d(2), concluido_em: "", categoria: "Manutenção Corretiva", local_pnr: "Bloco C, apto 204",
      escopo: "Infiltração ativa na laje do banheiro com desprendimento de reboco sobre a área de circulação.", prioridade: "Nível 1 (Urgente/Crítico)", risco: "Estrutural",
      beneficio: "Elimina risco de queda de reboco e preserva a estrutura da laje.", despacho: "Autorizado pelo Presidente da Vila para execução imediata.", status: "Em andamento", pendencia_motivo: "" },
    { protocolo: ym(15) + "-002", aberto_em: d(15), atualizado_em: d(3), concluido_em: "", categoria: "Manutenção Corretiva", local_pnr: "Quadra de esportes",
      escopo: "Substituição de luminárias queimadas e revisão do quadro de comando.", prioridade: "Nível 1 (Urgente/Crítico)", risco: "Elétrico",
      beneficio: "Restabelece a iluminação noturna e reduz risco de choque.", despacho: "", status: "Pendência", pendencia_motivo: "Aguardando entrega das luminárias LED (pedido em processo de aquisição)." },
    { protocolo: ym(12) + "-003", aberto_em: d(12), atualizado_em: d(12), concluido_em: "", categoria: "Melhoria", local_pnr: "Área de lazer",
      escopo: "Instalação de bancos e cobertura leve no parquinho infantil.", prioridade: "Nível 3 (Rotina/Baixa)", risco: "Nenhum",
      beneficio: "Amplia o conforto e a permanência das famílias na área de lazer.", despacho: "", status: "A começar", pendencia_motivo: "" },
    { protocolo: ym(9) + "-004", aberto_em: d(9), atualizado_em: d(1), concluido_em: "", categoria: "Reforma", local_pnr: "Bloco A, área comum",
      escopo: "Reforma da rede de esgoto do prumada com troca de trechos de tubulação comprometidos.", prioridade: "Nível 2 (Moderado)", risco: "Sanitário",
      beneficio: "Evita retorno de esgoto e proliferação de vetores nos apartamentos do térreo.", despacho: "Endossado pelo Cmt da Guarnição conforme Parte nº 12.", status: "Em andamento", pendencia_motivo: "" },
    { protocolo: ym(6) + "-005", aberto_em: d(6), atualizado_em: d(1), concluido_em: d(1), categoria: "Adequação", local_pnr: "Portaria",
      escopo: "Adequação de rampa de acesso para pessoas com mobilidade reduzida.", prioridade: "Nível 2 (Moderado)", risco: "Nenhum",
      beneficio: "Acessibilidade para moradores idosos e PCD.", despacho: "Aprovado pelo Presidente da Vila.", status: "Finalizado", pendencia_motivo: "" },
    { protocolo: ym(3) + "-006", aberto_em: d(3), atualizado_em: d(3), concluido_em: "", categoria: "Manutenção Corretiva", local_pnr: "Bloco B, hall",
      escopo: "Troca de fechadura e dobradiças da porta de acesso ao bloco.", prioridade: "Nível 3 (Rotina/Baixa)", risco: "Nenhum",
      beneficio: "Segurança patrimonial do bloco.", despacho: "", status: "A começar", pendencia_motivo: "" },
  ];
}

const lerDemo = () => {
  try {
    const bruto = localStorage.getItem(CHAVE_DEMO);
    if (bruto) return JSON.parse(bruto);
  } catch { /* ignora */ }
  const inicial = amostra();
  gravarDemo(inicial);
  return inicial;
};
const gravarDemo = (lista) => { try { localStorage.setItem(CHAVE_DEMO, JSON.stringify(lista)); } catch { /* ignora */ } };

function protocoloDemo(lista) {
  const n = new Date();
  const pref = "#" + n.getFullYear() + String(n.getMonth() + 1).padStart(2, "0") + "-";
  const max = lista.reduce((m, x) => (x.protocolo.startsWith(pref) ? Math.max(m, parseInt(x.protocolo.slice(pref.length), 10) || 0) : m), 0);
  return pref + String(max + 1).padStart(3, "0");
}

function aplicarRegras(d, anterior) {
  const t = agoraISO();
  d.atualizado_em = t;
  if (d.status === "Finalizado") d.concluido_em = anterior && anterior.status === "Finalizado" ? anterior.concluido_em : t;
  else d.concluido_em = "";
  return d;
}

/* ---------- API pública ---------- */

export async function listar() {
  if (modoDemo) return lerDemo();
  try {
    const j = await requisitar(CONFIG.API_URL + "?action=list&_=" + Date.now());
    try { localStorage.setItem(CHAVE_CACHE, JSON.stringify(j.demandas)); } catch { /* ignora */ }
    return j.demandas;
  } catch (e) {
    e.cache = lerCache();
    throw e;
  }
}

export function lerCache() {
  try { return JSON.parse(localStorage.getItem(CHAVE_CACHE) || "null"); } catch { return null; }
}

export async function criar(dados) {
  if (modoDemo) {
    const lista = lerDemo();
    const d = aplicarRegras({ ...dados, protocolo: protocoloDemo(lista), aberto_em: agoraISO() }, null);
    lista.push(d);
    gravarDemo(lista);
    return d;
  }
  return (await postar({ action: "create", data: dados })).demanda;
}

export async function atualizar(protocolo, dados) {
  if (modoDemo) {
    const lista = lerDemo();
    const i = lista.findIndex((x) => x.protocolo === protocolo);
    if (i < 0) throw new Error("Demanda não encontrada.");
    lista[i] = aplicarRegras({ ...lista[i], ...dados }, lista[i]);
    gravarDemo(lista);
    return lista[i];
  }
  return (await postar({ action: "update", protocolo, data: dados })).demanda;
}

export async function excluir(protocolo) {
  if (modoDemo) {
    gravarDemo(lerDemo().filter((x) => x.protocolo !== protocolo));
    return;
  }
  await postar({ action: "delete", protocolo });
}

export async function historico(protocolo) {
  if (modoDemo) return [];
  return (await requisitar(CONFIG.API_URL + "?action=historico&protocolo=" + encodeURIComponent(protocolo))).historico;
}
