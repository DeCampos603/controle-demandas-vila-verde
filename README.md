# Controle de Demandas — Residencial Vila Verde

Site estático (HTML/CSS/JS vanilla, sem build, sem CDN, sem login) para a Diretoria da Vila controlar
demandas de PNR. Os dados vivem numa **planilha Google**; cada inclusão, edição ou exclusão feita no
site grava na planilha na hora, por um Google Apps Script.

```
docs/          site publicado no GitHub Pages
apps-script/   Codigo.gs — back-end colado na planilha
testes/        node testes/teste_apps_script.js  (testa o back-end com planilha simulada)
```

## Ligar à planilha (uma vez, ~5 min)

1. Abra `Demandas-Vila-Verde.xlsx` (gerado por `ferramentas/gerar_planilha.py`) no Google Sheets e use
   **Arquivo > Salvar como Planilha Google**. O Apps Script só se liga à versão nativa, não ao `.xlsx`.
   (Alternativa: uma planilha Google em branco; o passo 3 monta as abas sozinho.)
2. Na planilha nativa: **Extensões > Apps Script**. Apague o conteúdo e cole `apps-script/Codigo.gs`. Salve.
3. Escolha a função **`configurar`** e clique em **Executar**; autorize. Ela confere e formata as abas
   `Demandas` (com listas suspensas) e `Historico`.
4. **Implantar > Nova implantação > App da Web** — *Executar como: Eu* · *Quem pode acessar: Qualquer pessoa*.
5. Copie a URL terminada em `/exec` e cole em `docs/js/config.js` → `API_URL`.
6. Publique a pasta `docs/` no GitHub Pages.

Enquanto `API_URL` estiver vazia o site roda em **modo demonstração** (dados só no navegador).

Ao mudar o `Codigo.gs` depois: **Implantar > Gerenciar implantações > editar > Nova versão** (a URL não muda).

## Como a planilha funciona

- **Demandas**: uma linha por demanda. O site localiza as colunas pelo **nome do cabeçalho**, então você
  pode reordenar, colorir, filtrar, congelar e acrescentar colunas suas. Não renomeie os cabeçalhos
  existentes nem apague as colunas do sistema.
- **Historico**: cada criação, alteração (campo, valor antigo → novo) e exclusão fica registrada.
- **Exclusão é lógica**: a linha continua na planilha com `Excluído = SIM` e some do site.
- O ID `#AAAAMM-NNN` é gerado pelo servidor, reinicia a cada mês e nunca reaproveita número.
- A "Data de Conclusão" é preenchida ao virar *Finalizado* e limpa se a demanda for reaberta.

## Segurança (site público, sem login)

Qualquer pessoa com o link do site pode ler e gravar. Por isso:
- Não divulgue o link fora da Diretoria; o site tem `noindex` e não aparece em buscadores.
- A planilha em si **não** precisa ser compartilhada com ninguém: só o Apps Script (rodando como você) a acessa.
- Há freio de 400 gravações/hora, validação de todos os campos no servidor e limite de tamanho.
- A URL `/exec` fica visível no código do site. Se houver abuso, gere uma nova implantação e troque a URL.
- Não registre dados pessoais sensíveis de moradores (CPF, saúde etc.) nos textos das demandas.
