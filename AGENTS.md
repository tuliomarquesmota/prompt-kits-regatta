# Regras do projeto LOTE

Este arquivo vale para **qualquer IA** que escreva código neste repositório (Claude, ChatGPT/Codex, Copilot, Cursor) e para as pessoas.
Se você é uma IA: leia este arquivo inteiro antes de mudar qualquer coisa e siga as regras mesmo que o pedido não as mencione.
Se um pedido contradizer uma regra daqui, avise a pessoa antes de fazer.

## O que é o projeto

Sistema de stock para **importadores e distribuidores de carne no Reino Unido**.
Primeiro cliente: SA Global Meat (distribuidora) e a loja MyBrazil, dos mesmos sócios.

Fase atual: **fase 1, substituir o SOS Inventory**: receber caixas por scan, controlar stock por caixa (peso, lote, validade), vender e emitir invoice pelo peso real.
Plano completo: [`docs/plano.md`](docs/plano.md). Etiquetas dos fornecedores: [`docs/etiquetas.md`](docs/etiquetas.md).

## Conceitos do negócio (use estes nomes)

| Termo              | Significado                                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Caixa (`box`)      | Unidade central do stock. Cada caixa tem peso real, lote, validade e número próprios. Nunca trate stock só como "kg de picanha".                                  |
| Peso variável      | Cada caixa pesa diferente (catch weight). Preço é por kg; a invoice usa o peso real de cada caixa.                                                                |
| Etiqueta           | A label do frigorífico na caixa. Lida por scan, nunca digitada quando o código traz o dado.                                                                       |
| Perfil de etiqueta | Regras de um fornecedor para interpretar a etiqueta (tabela `label_profiles`).                                                                                    |
| GS1-128            | Padrão de código de barras com identificadores: `(01)` produto, `(310x)` peso kg, `(13)` embalagem, `(11)` produção, `(17)` validade, `(10)` lote, `(21)` serial. |
| FEFO               | First expired, first out: a caixa que vence primeiro sai primeiro.                                                                                                |
| Bloqueada          | Caixa vencida ou com problema: não pode ser vendida.                                                                                                              |
| Empresa (`org`)    | Cada cliente do sistema. Os dados de uma empresa nunca aparecem para outra.                                                                                       |

## Stack (não troque sem combinar com os sócios)

- **Next.js 15** (App Router) + **React 19** + **TypeScript** estrito
- **Supabase** (Postgres, login, Row Level Security)
- **PWA offline**: IndexedDB (`idb`) + service worker em `public/sw.js`
- Leitura de código de barras: `BarcodeDetector` nativo, com `@zxing/browser` como alternativa
- CSS puro em `app/globals.css` com variáveis (`var(--accent)` etc.). **Não adicione** Tailwind, styled-components, Material UI ou outra biblioteca de UI.
- Testes: `node:test` nativo (`lib/*.test.ts`)

Não adicione dependências novas sem motivo forte. Se precisar, explique no Pull Request por quê.

## Estrutura

```
app/<rota>/page.tsx      telas
app/api/v1/<rota>/       API pública (versionada)
components/              componentes reutilizáveis
lib/                     lógica sem tela (leitura de etiquetas, banco local, sincronização)
lib/*.test.ts            testes
supabase/migrations/     banco de dados, numerado: 001_, 002_, 003_…
docs/                    plano, decisões, guia de etiquetas, protótipos, fotos
```

## Regras de código

**Idioma**

- Nomes no código (variáveis, funções, tabelas, colunas): **inglês**. Ex.: `netWeightKg`, `boxes`, `use_by`
- Textos que o usuário vê, comentários e documentação: **português do Brasil**
- Exceção já existente: as chaves JSON dos perfis de etiqueta (`tipo`, `prefixo_gtin`, `shelf_dias`…) estão em português. Mantenha assim.

**Banco de dados**

- Toda tabela de dados tem `org_id` e **Row Level Security** com `is_member(org_id)`. Sem exceção.
- Nunca altere uma migration que já foi para a `main`. Mudanças vão num arquivo novo com o próximo número.
- Pesos em kg com `numeric(8,3)`; dinheiro com `numeric(12,2)`. Nunca `float` para dinheiro ou peso.
- Datas de validade como `date` (sem hora).

**Etiquetas**

- Toda regra nova de fornecedor entra como **perfil** (dados), não como `if` no código.
- Todo fornecedor novo ganha um teste em `lib/labels.test.ts` com um **código real** lido da etiqueta, e a foto em `docs/etiquetas/fotos/`.
- Se o peso lido estiver fora da faixa do perfil, avise; não aceite em silêncio.

**Offline**

- A tela de recebimento precisa funcionar sem internet. Nada nela pode depender de uma chamada ao servidor para registrar uma caixa.
- Ids de registros criados no celular são gerados no celular (`crypto.randomUUID()`), para que reenviar não duplique.

**Telas**

- Pensadas primeiro para **celular**, usadas com luvas na câmara fria: botões com no mínimo 48px de altura, texto legível, poucas ações por tela.
- Use as classes e variáveis de `app/globals.css`. Funciona em modo claro e escuro.
- Mensagens dizem o que aconteceu e o que fazer ("Sem internet: a caixa ficou salva e será enviada depois"), sem pedir desculpa.

**Segurança**

- Nunca coloque chaves, senhas ou `.env` no código ou no repositório.
- A chave `service_role` do Supabase nunca vai para o navegador.

## Antes de entregar qualquer mudança

Rode e garanta que passa:

```bash
npm run check   # formatação, tipos e testes
npm run build
```

Se `format:check` falhar, rode `npm run format`.
O GitHub roda as mesmas verificações em todo Pull Request ([`.github/workflows/verificar.yml`](.github/workflows/verificar.yml)).

## Como trabalhar (pessoas e IAs)

- Nunca envie direto para a `main`. Crie um branch por tarefa: `feat/tela-stock`, `fix/peso-liffey`, `docs/perfil-dunbia`
- Commits pequenos, mensagem em português no imperativo: `Adiciona perfil da Dunbia`
- Abra um Pull Request usando o modelo, diga o que mudou e como testou
- Mudanças em telas: inclua um print no PR
- O outro sócio revisa antes de juntar

Detalhes do fluxo: [`CONTRIBUTING.md`](CONTRIBUTING.md).
