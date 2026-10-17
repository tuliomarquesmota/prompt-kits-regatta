# Protótipos

Desenhos e testes feitos para visualizar ideias. **Não são o sistema**: servem de referência visual e de comportamento para as telas reais em `app/`.

| Protótipo | O que mostra | Como abrir |
| --------- | ------------ | ---------- |
| **Plataforma (dashboard)** | Todas as telas da visão completa: painel, recebimento, stock por caixa com FEFO, compras e bills, vendas e clientes, invoices pelo peso real, DRE e balanço, VAT/HMRC e conciliação bancária, payroll. Dados fictícios. | Link do artifact no Claude (peça o acesso ao Túlio). O arquivo `dashboard-plataforma.dc.html` é o código-fonte do desenho; ele não abre sozinho no navegador. |
| **Scanner de caixas** | O primeiro teste de leitura de etiqueta por foto, com perfis Teys, Silver Fern e Liffey. | Baixe `scanner-caixas.html` e abra no navegador. |

## Como usar na hora de construir uma tela

1. Abra o protótipo da tela
2. Construa a versão real em `app/`, seguindo o `AGENTS.md`: CSS de `app/globals.css`, pensada para celular, dados vindos do Supabase
3. Não copie o código do protótipo. Ele usa outro formato e dados inventados; a tela real precisa de dados de verdade, modo offline quando fizer sentido e segurança por empresa

O que já foi aproveitado:

- A leitura de etiquetas do scanner virou `lib/labels.ts`, com testes
- A tela "Recebimento" do dashboard virou `app/receber/page.tsx`
