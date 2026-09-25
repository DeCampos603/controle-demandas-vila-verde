/* Configuração do site.
   API_URL: cole aqui a URL "/exec" do Apps Script (ver README).
   Vazia = modo demonstração: os dados ficam só neste navegador e NÃO vão para a planilha. */
export const CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbwl_KVLCHbaifCUqoHOlcNgRUrVpqA6pSIyzpYhngoD6hrtQ3kyoCZ3BtkuDDbWQr__/exec",
  NOME_LOCAL: "Residencial Vila Verde",
  SUBTITULO: "Diretoria da Vila · Controle de Demandas de PNR",
  ATUALIZAR_A_CADA_MS: 60000,
};

export const LISTAS = {
  categoria: ["Adequação", "Reforma", "Melhoria", "Manutenção Corretiva"],
  prioridade: ["Nível 1 (Urgente/Crítico)", "Nível 2 (Moderado)", "Nível 3 (Rotina/Baixa)"],
  risco: ["Estrutural", "Elétrico", "Sanitário", "Nenhum"],
  status: ["A começar", "Em andamento", "Pendência", "Finalizado"],
};
