/**
 * Controle de Demandas — Vila Verde
 * Back-end em Google Apps Script, vinculado a uma planilha do Google Sheets.
 *
 * Como usar (uma vez só):
 *   1. Na planilha: Extensões > Apps Script. Cole este arquivo em Codigo.gs.
 *   2. Execute a função `configurar` (autorize quando pedir). Ela cria as abas
 *      "Demandas" e "Historico" já formatadas.
 *   3. Implantar > Nova implantação > Tipo "App da Web"
 *        Executar como: Eu     |     Quem pode acessar: Qualquer pessoa
 *   4. Copie a URL terminada em /exec para docs/js/config.js (API_URL).
 *
 * As colunas são localizadas pelo NOME do cabeçalho, então você pode reordenar,
 * formatar e acrescentar colunas suas na planilha sem quebrar o site.
 */

const FUSO = 'America/Sao_Paulo';
const ABA_DEMANDAS = 'Demandas';
const ABA_HISTORICO = 'Historico';

// chave interna -> cabeçalho na planilha
const CAMPOS = {
  protocolo: 'ID do Protocolo',
  aberto_em: 'Data de Abertura',
  atualizado_em: 'Última Atualização',
  concluido_em: 'Data de Conclusão',
  categoria: 'Categoria',
  local_pnr: 'Local / PNR',
  escopo: 'Descrição do Escopo',
  prioridade: 'Prioridade',
  risco: 'Matriz de Risco',
  beneficio: 'Benefício Direto',
  despacho: 'Despacho Institucional',
  status: 'Status da Execução',
  pendencia_motivo: 'Motivo da Pendência',
  excluido: 'Excluído',
};
const CAMPOS_DATA = ['aberto_em', 'atualizado_em', 'concluido_em'];
const CAMPOS_TEXTO = Object.keys(CAMPOS).filter(function (k) { return CAMPOS_DATA.indexOf(k) < 0; });
// campos que o usuário do site pode enviar
const EDITAVEIS = ['categoria', 'local_pnr', 'escopo', 'prioridade', 'risco', 'beneficio', 'despacho', 'status', 'pendencia_motivo'];

const LISTAS = {
  categoria: ['Adequação', 'Reforma', 'Melhoria', 'Manutenção Corretiva'],
  prioridade: ['Nível 1 (Urgente/Crítico)', 'Nível 2 (Moderado)', 'Nível 3 (Rotina/Baixa)'],
  risco: ['Estrutural', 'Elétrico', 'Sanitário', 'Nenhum'],
  status: ['A começar', 'Em andamento', 'Pendência', 'Finalizado'],
};
const LIMITES = { escopo: 2000, beneficio: 1000, despacho: 1000, pendencia_motivo: 500, local_pnr: 120 };
const MAX_ESCRITAS_POR_HORA = 400;

/* ---------- Instalação ---------- */

function configurar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(ABA_DEMANDAS) || ss.insertSheet(ABA_DEMANDAS);
  const chaves = Object.keys(CAMPOS);
  const cab = chaves.map(function (k) { return CAMPOS[k]; });
  aba.getRange(1, 1, 1, cab.length).setValues([cab])
    .setFontWeight('bold').setBackground('#1E6B34').setFontColor('#FFFFFF').setWrap(true);
  aba.setFrozenRows(1);
  aba.setFrozenColumns(1);
  chaves.forEach(function (k, i) {
    const col = i + 1;
    const corpo = aba.getRange(2, col, aba.getMaxRows() - 1, 1);
    if (CAMPOS_DATA.indexOf(k) >= 0) corpo.setNumberFormat('dd/MM/yyyy HH:mm');
    else corpo.setNumberFormat('@'); // texto puro: impede que "=algo" vire fórmula
    if (LISTAS[k]) {
      corpo.setDataValidation(SpreadsheetApp.newDataValidation()
        .requireValueInList(LISTAS[k], true).setAllowInvalid(false).build());
    }
  });
  const larguras = { protocolo: 110, aberto_em: 130, atualizado_em: 130, concluido_em: 130, escopo: 380,
    beneficio: 280, despacho: 280, pendencia_motivo: 220, categoria: 150, prioridade: 170, status: 130, risco: 120, local_pnr: 140, excluido: 80 };
  chaves.forEach(function (k, i) { aba.setColumnWidth(i + 1, larguras[k] || 140); });
  aba.getRange(2, 1, aba.getMaxRows() - 1, chaves.length).setWrap(true).setVerticalAlignment('top');

  let hist = ss.getSheetByName(ABA_HISTORICO) || ss.insertSheet(ABA_HISTORICO);
  hist.getRange(1, 1, 1, 6).setValues([['Quando', 'ID do Protocolo', 'Ação', 'Campo', 'De', 'Para']])
    .setFontWeight('bold').setBackground('#1B2A4A').setFontColor('#FFFFFF');
  hist.setFrozenRows(1);
  hist.getRange(2, 1, hist.getMaxRows() - 1, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  hist.getRange(2, 2, hist.getMaxRows() - 1, 5).setNumberFormat('@');
  hist.setColumnWidths(1, 1, 150); hist.setColumnWidths(2, 1, 110); hist.setColumnWidths(3, 2, 130); hist.setColumnWidths(5, 2, 300);

  const padrao = ss.getSheetByName('Planilha1') || ss.getSheetByName('Sheet1');
  if (padrao && ss.getSheets().length > 2) ss.deleteSheet(padrao);
  SpreadsheetApp.flush();
}

/* ---------- Entrada HTTP ---------- */

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'historico') return saida({ ok: true, historico: lerHistorico(String(p.protocolo || '')) });
    return saida({ ok: true, demandas: listar(), servidor_em: new Date().toISOString() });
  } catch (err) {
    return saida({ ok: false, erro: String(err.message || err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return saida({ ok: false, erro: 'Sistema ocupado. Tente novamente.' });
  }
  try {
    excedeuLimite();
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    let demanda;
    if (req.action === 'create') demanda = criar(req.data || {});
    else if (req.action === 'update') demanda = atualizar(String(req.protocolo || ''), req.data || {});
    else if (req.action === 'delete') demanda = excluir(String(req.protocolo || ''));
    else throw new Error('Ação inválida.');
    return saida({ ok: true, demanda: demanda });
  } catch (err) {
    return saida({ ok: false, erro: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function saida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Leitura ---------- */

function abaDemandas() {
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_DEMANDAS);
  if (!aba) throw new Error('Aba "Demandas" não encontrada. Execute a função configurar().');
  return aba;
}

// mapa chave -> índice de coluna (1-based), lido do cabeçalho
function mapaColunas(aba) {
  const cab = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0].map(String);
  const mapa = {};
  Object.keys(CAMPOS).forEach(function (k) {
    const i = cab.indexOf(CAMPOS[k]);
    if (i < 0) throw new Error('Coluna "' + CAMPOS[k] + '" não encontrada no cabeçalho.');
    mapa[k] = i + 1;
  });
  return mapa;
}

function valorParaJson(chave, v) {
  if (CAMPOS_DATA.indexOf(chave) >= 0) {
    if (v instanceof Date) return v.toISOString();
    return v ? String(v) : '';
  }
  return v === null || v === undefined ? '' : String(v);
}

function listar() {
  const aba = abaDemandas();
  const mapa = mapaColunas(aba);
  const ultima = aba.getLastRow();
  if (ultima < 2) return [];
  const dados = aba.getRange(2, 1, ultima - 1, aba.getLastColumn()).getValues();
  const saidaLista = [];
  dados.forEach(function (linha) {
    if (!linha[mapa.protocolo - 1]) return;
    if (String(linha[mapa.excluido - 1]).toUpperCase() === 'SIM') return;
    const d = {};
    Object.keys(mapa).forEach(function (k) { d[k] = valorParaJson(k, linha[mapa[k] - 1]); });
    delete d.excluido;
    saidaLista.push(d);
  });
  return saidaLista;
}

function achar(aba, mapa, protocolo) {
  const ultima = aba.getLastRow();
  if (ultima < 2) return 0;
  const ids = aba.getRange(2, mapa.protocolo, ultima - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === protocolo) return i + 2;
  return 0;
}

function lerLinha(aba, mapa, n) {
  const linha = aba.getRange(n, 1, 1, aba.getLastColumn()).getValues()[0];
  const d = {};
  Object.keys(mapa).forEach(function (k) { d[k] = valorParaJson(k, linha[mapa[k] - 1]); });
  return d;
}

/* ---------- Validação ---------- */

function limpar(data) {
  const r = {};
  EDITAVEIS.forEach(function (k) {
    if (data[k] === undefined) return;
    let v = String(data[k]).replace(/\s+$/g, '').replace(/^\s+/g, '');
    if (LIMITES[k] && v.length > LIMITES[k]) throw new Error('O campo "' + CAMPOS[k] + '" excede ' + LIMITES[k] + ' caracteres.');
    if (LISTAS[k] && LISTAS[k].indexOf(v) < 0) throw new Error('Valor inválido em "' + CAMPOS[k] + '".');
    r[k] = v;
  });
  return r;
}

function validarCompleto(d) {
  ['categoria', 'escopo', 'prioridade', 'risco', 'status'].forEach(function (k) {
    if (!d[k]) throw new Error('Preencha "' + CAMPOS[k] + '".');
  });
  if (d.status === 'Pendência' && !d.pendencia_motivo) throw new Error('Informe o motivo da pendência (material, licitação etc.).');
}

/* ---------- Escrita ---------- */

function agora() { return new Date(); }

function proximoProtocolo(aba, mapa) {
  const prefixo = '#' + Utilities.formatDate(agora(), FUSO, 'yyyyMM') + '-';
  const ultima = aba.getLastRow();
  let max = 0;
  if (ultima >= 2) {
    aba.getRange(2, mapa.protocolo, ultima - 1, 1).getValues().forEach(function (l) {
      const id = String(l[0]);
      if (id.indexOf(prefixo) === 0) max = Math.max(max, parseInt(id.slice(prefixo.length), 10) || 0);
    });
  }
  return prefixo + ('000' + (max + 1)).slice(-3);
}

function gravarLinha(aba, mapa, n, d) {
  Object.keys(mapa).forEach(function (k) {
    if (d[k] === undefined) return;
    const c = aba.getRange(n, mapa[k]);
    if (CAMPOS_DATA.indexOf(k) >= 0) c.setValue(d[k] ? new Date(d[k]) : '');
    else c.setValue(d[k]);
  });
}

function criar(data) {
  const d = limpar(data);
  if (!d.status) d.status = 'A começar';
  if (!d.risco) d.risco = 'Nenhum';
  validarCompleto(d);
  const aba = abaDemandas();
  const mapa = mapaColunas(aba);
  const n = aba.getLastRow() + 1;
  const t = agora();
  d.protocolo = proximoProtocolo(aba, mapa);
  d.aberto_em = t.toISOString();
  d.atualizado_em = t.toISOString();
  d.concluido_em = d.status === 'Finalizado' ? t.toISOString() : '';
  d.excluido = '';
  gravarLinha(aba, mapa, n, d);
  registrar(d.protocolo, 'Criou', '', '', 'Status: ' + d.status);
  SpreadsheetApp.flush();
  return lerLinha(aba, mapa, n);
}

function atualizar(protocolo, data) {
  const aba = abaDemandas();
  const mapa = mapaColunas(aba);
  const n = achar(aba, mapa, protocolo);
  if (!n) throw new Error('Demanda ' + protocolo + ' não encontrada.');
  const antes = lerLinha(aba, mapa, n);
  const novo = limpar(data);
  const depois = {};
  EDITAVEIS.forEach(function (k) { depois[k] = novo[k] !== undefined ? novo[k] : antes[k]; });
  validarCompleto(depois);
  const t = agora();
  const mudou = [];
  EDITAVEIS.forEach(function (k) { if (depois[k] !== antes[k]) mudou.push(k); });
  if (!mudou.length) return antes;
  if (depois.status !== 'Pendência') depois.pendencia_motivo = depois.pendencia_motivo || '';
  depois.atualizado_em = t.toISOString();
  if (depois.status === 'Finalizado' && antes.status !== 'Finalizado') depois.concluido_em = t.toISOString();
  if (depois.status !== 'Finalizado') depois.concluido_em = '';
  gravarLinha(aba, mapa, n, depois);
  mudou.forEach(function (k) { registrar(protocolo, 'Alterou', CAMPOS[k], antes[k], depois[k]); });
  SpreadsheetApp.flush();
  return lerLinha(aba, mapa, n);
}

// Exclusão lógica: a linha permanece na planilha com "Excluído = SIM" e fica no histórico.
function excluir(protocolo) {
  const aba = abaDemandas();
  const mapa = mapaColunas(aba);
  const n = achar(aba, mapa, protocolo);
  if (!n) throw new Error('Demanda ' + protocolo + ' não encontrada.');
  aba.getRange(n, mapa.excluido).setValue('SIM');
  aba.getRange(n, mapa.atualizado_em).setValue(agora());
  registrar(protocolo, 'Excluiu', '', '', '');
  SpreadsheetApp.flush();
  return { protocolo: protocolo };
}

/* ---------- Histórico e proteção ---------- */

function registrar(protocolo, acao, campo, de, para) {
  const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_HISTORICO);
  if (!h) return;
  h.appendRow([agora(), protocolo, acao, campo, String(de).slice(0, 300), String(para).slice(0, 300)]);
}

function lerHistorico(protocolo) {
  const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_HISTORICO);
  if (!h || h.getLastRow() < 2) return [];
  return h.getRange(2, 1, h.getLastRow() - 1, 6).getValues()
    .filter(function (l) { return String(l[1]) === protocolo; })
    .map(function (l) {
      return { quando: l[0] instanceof Date ? l[0].toISOString() : String(l[0]), acao: l[2], campo: l[3], de: l[4], para: l[5] };
    });
}

// Freio simples contra abuso: como o site é público, limita o total de escritas por hora.
function excedeuLimite() {
  const cache = CacheService.getScriptCache();
  const chave = 'escritas_' + Utilities.formatDate(agora(), FUSO, 'yyyyMMddHH');
  const n = parseInt(cache.get(chave) || '0', 10) + 1;
  cache.put(chave, String(n), 3600);
  if (n > MAX_ESCRITAS_POR_HORA) throw new Error('Limite de gravações por hora atingido. Tente mais tarde.');
}
