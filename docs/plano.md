# Plano do LOTE

## A ideia

Um sistema de stock **feito para importadores e distribuidores de carne e alimentos refrigerados no Reino Unido**.
Os softwares genéricos (SOS Inventory, Zoho, Unleashed) lidam mal com o que esse negócio tem de específico:

- **Peso variável**: cada caixa pesa diferente, mas o preço é por kg
- **Lote e validade por caixa**, com rastreabilidade até o cliente (recall)
- **Etiquetas de frigoríficos do mundo todo**, cada uma num padrão
- **Custo real (landed cost)**: frete, importação, câmbio e câmara fria

Primeiro cliente: o próprio grupo (SA Global Meat e a loja MyBrazil). Depois, outros distribuidores.

**Posicionamento:** "Escaneia a caixa, registra peso, lote e validade, rastreia até o cliente e sincroniza com seu Xero ou QuickBooks."

## O que o grupo usa hoje

| Software      | Uso                            | Substituído na                    |
| ------------- | ------------------------------ | --------------------------------- |
| SOS Inventory | Stock da distribuidora         | Fase 1                            |
| Hostinger     | Loja online / site             | Fase 2                            |
| QuickBooks    | Contabilidade                  | Fase 3                            |
| Epos Now      | Caixa e stock da loja MyBrazil | Fase 4                            |
| Sage          | Payslip (folha)                | Integrar, talvez nunca substituir |

Integrações atuais que precisam continuar funcionando:

- O **site da SA** consulta o stock pela **API do SOS Inventory** → passa a consultar `GET /api/v1/stock` do LOTE (já existe)
- A **loja MyBrazil** usa o stock pela **API do Epos Now** → continua assim até a fase 4

## Fases

### Fase 1 · Substituir o SOS Inventory (agora)

1. ✅ Base: Next.js + Supabase, login, empresas, segurança por empresa
2. ✅ Banco de dados da fase 1 (caixas, compras, vendas, invoices, rastreabilidade)
3. ✅ Recebimento por scan com câmera ao vivo e **modo offline**
4. ✅ Leitor de etiquetas com perfis por fornecedor (Teys, Silver Fern, Liffey)
5. ✅ API de stock para o site da SA
6. ✅ Stock por produto: cada caixa com peso e validade, FEFO, bloqueio das vencidas
7. ✅ Cadastros pelo app: produtos, fornecedores, locais, clientes (perfis de etiqueta ainda por SQL)
8. ⬜ Importar o cadastro atual exportando CSV do SOS
9. ✅ Pedido de venda → scan na expedição → invoice pelo peso real, cancelamento e devolução com credit note
10. ⬜ Integração com o QuickBooks (envio das invoices)
11. ⬜ Rodar em paralelo com o SOS por 2 a 4 semanas. Só desligar o SOS quando o stock dos dois bater

### Fase 2 · Loja online / portal de pedidos

Loja ligada ao stock real, tabela de preço por cliente, cliente B2B faz o próprio pedido.

### Fase 3 · Contabilidade própria

DRE, balanço, VAT. Para enviar VAT à HMRC (Making Tax Digital) o software precisa ser reconhecido por eles. O sócio contador conduz.

Adiantado em out/2026, enquanto a fase 1 espera dados dos sócios:

- ✅ VAT por produto (0, 5, 20%) nas invoices e credit notes
- ✅ Contas a receber: pagamentos parciais, saldo, atraso por cliente
- ✅ Contas a pagar: despesas com VAT, pagamentos, vencimentos
- ✅ Plano de contas padrão (UK, simplificado), editável
- ✅ Livro contábil automático em partidas dobradas (regime de competência) e lançamento manual
- ✅ Relatórios: DRE, balanço e prévia do VAT nas 9 caixas, balancete em CSV
- ⬜ Revisão do contador: plano de contas, taxas de VAT, regras de lançamento
- ⬜ Contas bancárias separadas e conciliação com o extrato
- ⬜ Custo da mercadoria vendida por caixa (hoje as compras entram como despesa)
- ⬜ VAT de importação diferido (postponed VAT accounting)
- ⬜ Envio do VAT à HMRC (Making Tax Digital)

### Fase 4 · Caixa da loja (substituir o Epos Now)

Precisa funcionar sem internet, com impressora, balança e maquininha. A transferência da distribuidora para a loja vira um scan.

## Decisões tomadas

| Decisão                                                                       | Por quê                                                                                       |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Começar pela distribuidora, não pela loja                                     | É onde está a dor do peso variável e o ticket da assinatura é maior                           |
| Stock controlado por **caixa**, não por kg total                              | Peso, lote e validade são de cada caixa; é o que o SOS faz bem hoje e precisamos manter       |
| Ler o código GS1 da etiqueta do frigorífico, sem imprimir etiqueta própria    | Hoje o SOS gera e cola uma etiqueta por caixa: trabalho e papel que somem                     |
| Regras de etiqueta como **perfis** (dados), não código                        | Fornecedor novo não exige programar; perfis podem ser compartilhados entre clientes no futuro |
| PWA offline em vez de app de loja                                             | Câmara fria sem sinal; não depende de App Store                                               |
| Next.js + Supabase + TypeScript                                               | Aproveita a experiência em front-end; Supabase cuida de banco, login e segurança              |
| Integrar com QuickBooks antes de fazer contabilidade própria                  | VAT/MTD é regulado; contabilidade vem quando já houver clientes pagando                       |
| Maquininhas por parceria (Stripe Terminal, SumUp)                             | Ser adquirente exige licença da FCA                                                           |
| Um arquivo de regras (`AGENTS.md`) para todas as IAs + verificação automática | Os sócios usam Claude e ChatGPT; o código precisa ter um padrão só                            |

## Concorrência a acompanhar

- **Zoho Inventory/Books**: em junho de 2026 lançou códigos de barras com lote e quantidade num scan (só no plano Enterprise). Testar se lê o GS1 do fornecedor.
- **Unleashed**: o plano Core limita 100 pedidos de venda por mês; distribuidor passa fácil disso.
- Nenhum concorrente olhado trata peso variável e leitura GS1 do fornecedor como centro do produto.

## Em aberto

- Sociedade: percentuais, vesting, empresa separada para o software, quem decide o quê
- Nome do produto ("LOTE" é provisório)
- Custos mensais de cada software atual, para calcular a economia
- Fotos nítidas das etiquetas dos demais fornecedores (Dunbia e outros)
