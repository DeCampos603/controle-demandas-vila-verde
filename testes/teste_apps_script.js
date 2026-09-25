const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('G:/Meu Drive/REPO/Controle-Demandas-VilaVerde/apps-script/Codigo.gs','utf8');
// planilha simulada
function Sheet(name){this.name=name;this.rows=[];this.frozen=0;}
Sheet.prototype={
 getLastRow(){return this.rows.length},getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length))},getMaxRows(){return 1000},
 getRange(r,c,nr=1,nc=1){const s=this;const R={
  getValues(){const o=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++)row.push((s.rows[r-1+i]||[])[c-1+j]??'');o.push(row)}return o},
  setValues(v){v.forEach((row,i)=>row.forEach((x,j)=>{(s.rows[r-1+i]=s.rows[r-1+i]||[])[c-1+j]=x}));return R},
  setValue(x){(s.rows[r-1]=s.rows[r-1]||[])[c-1]=x;return R}};
  for(const m of['setFontWeight','setBackground','setFontColor','setWrap','setNumberFormat','setDataValidation','setVerticalAlignment'])R[m]=()=>R;return R},
 appendRow(v){this.rows.push(v)},setFrozenRows(){},setFrozenColumns(){},setColumnWidth(){},setColumnWidths(){}};
const abas={};
const ss={getSheetByName:n=>abas[n]||null,insertSheet:n=>abas[n]=new Sheet(n),getSheets:()=>Object.values(abas),deleteSheet(){}};
const cache={};
const ctx={console,Date,JSON,Math,parseInt,String,Object,Error,
 SpreadsheetApp:{getActiveSpreadsheet:()=>ss,newDataValidation:()=>({requireValueInList(){return this},setAllowInvalid(){return this},build(){return {}}}),flush(){}},
 LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
 CacheService:{getScriptCache:()=>({get:k=>cache[k]||null,put:(k,v)=>{cache[k]=v}})},
 Utilities:{formatDate:(d,tz,f)=>{const p=n=>String(n).padStart(2,'0');return f==='yyyyMM'?d.getFullYear()+p(d.getMonth()+1):d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+p(d.getHours())}},
 ContentService:{MimeType:{JSON:1},createTextOutput:t=>({t,setMimeType(){return this}})}};
vm.createContext(ctx);vm.runInContext(src,ctx);
const post=o=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(o)}}).t);
const get=p=>JSON.parse(ctx.doGet({parameter:p}).t);
const ok=(c,m)=>{console.log((c?'OK  ':'FALHA ')+m);if(!c)process.exitCode=1};
ctx.configurar();
ok(abas.Demandas.rows[0].length===14,'cabeçalho com 14 colunas');
const base={categoria:'Reforma',escopo:'Telhado',prioridade:'Nível 1 (Urgente/Crítico)',risco:'Estrutural'};
let r=post({action:'create',data:base});
ok(r.ok&&/^#\d{6}-001$/.test(r.demanda.protocolo),'criar gera protocolo -001: '+(r.demanda&&r.demanda.protocolo));
const id1=r.demanda.protocolo;
r=post({action:'create',data:base});ok(r.demanda.protocolo.endsWith('-002'),'segundo protocolo -002');
r=post({action:'create',data:{...base,status:'Pendência'}});ok(!r.ok,'pendência sem motivo rejeitada: '+r.erro);
r=post({action:'create',data:{...base,categoria:'Outra'}});ok(!r.ok,'categoria inválida rejeitada');
r=post({action:'create',data:{...base,escopo:'x'.repeat(2001)}});ok(!r.ok,'escopo > limite rejeitado');
r=post({action:'update',protocolo:id1,data:{status:'Finalizado'}});ok(r.ok&&r.demanda.status==='Finalizado'&&r.demanda.concluido_em,'finalizar preenche conclusão');
r=post({action:'update',protocolo:id1,data:{status:'Em andamento'}});ok(r.ok&&r.demanda.concluido_em==='','reabrir limpa conclusão');
ok(get({}).demandas.length===2,'listar traz 2');
const h=get({action:'historico',protocolo:id1}).historico;ok(h.length>=3,'histórico tem '+h.length+' registros');
r=post({action:'delete',protocolo:id1});ok(r.ok,'excluir');
ok(get({}).demandas.length===1,'excluída some da lista');
ok(abas.Demandas.rows.some(l=>l[13]==='SIM'),'linha permanece na planilha marcada SIM');
r=post({action:'create',data:base});ok(r.demanda.protocolo.endsWith('-003'),'protocolo não reutiliza número após exclusão');
r=post({action:'update',protocolo:'#000000-999',data:{}});ok(!r.ok,'update inexistente falha');
// colunas reordenadas
const d=abas.Demandas;d.rows=d.rows.map(l=>{const c=l.slice();[c[0],c[6]]=[c[6],c[0]];return c});
ok(get({}).demandas.length===2&&get({}).demandas[0].protocolo.startsWith('#'),'funciona com colunas reordenadas');
