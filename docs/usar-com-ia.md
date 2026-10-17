# Como usar IA neste projeto (Claude ou ChatGPT)

Os sócios usam IAs diferentes. Para o código não virar uma colcha de retalhos, **todas seguem as mesmas regras**, escritas em [`AGENTS.md`](../AGENTS.md) na raiz do repositório.

Duas coisas garantem isso:

1. **O arquivo de regras.** O Claude Code e o Codex (ChatGPT) leem o `AGENTS.md` sozinhos quando trabalham no repositório. No chat comum, você cola as regras (modelo abaixo).
2. **A verificação automática.** Todo Pull Request passa por formatação, tipos, testes e build no GitHub. Não importa qual IA escreveu: se não passar, aparece um X vermelho e o PR não entra.

## Claude

**Claude Code** (no app do Claude ou no terminal), com o repositório conectado: ele já lê o `CLAUDE.md`, que aponta para o `AGENTS.md`. Não precisa fazer nada.

## ChatGPT

### Melhor opção: Codex conectado ao GitHub

O Codex trabalha direto no repositório, lê o `AGENTS.md` sozinho e abre Pull Requests. É o equivalente ao Claude Code.

### Se usar o chat comum do ChatGPT

O chat não enxerga o repositório sozinho. Para ele seguir as mesmas regras:

1. Crie um **Projeto** no ChatGPT chamado "LOTE"
2. Nas **instruções do projeto**, cole o texto do quadro abaixo
3. Adicione aos arquivos do projeto: `AGENTS.md`, `docs/plano.md` e `docs/etiquetas.md` (baixe do GitHub). Atualize quando eles mudarem.
4. Quando for mexer num arquivo, **cole a versão atual dele do GitHub** na conversa. A IA não pode adivinhar o código que já existe.

```text
Você está me ajudando no projeto LOTE, um sistema de stock para distribuidores de carne no Reino Unido.
O código está no GitHub (tuliomarquesmota/Lote). As regras do projeto estão no arquivo AGENTS.md anexado. Siga todas, mesmo que eu não as mencione.

Pontos que não podem falhar:
- Stack fixa: Next.js 15 (App Router), React 19, TypeScript estrito, Supabase, CSS puro de app/globals.css. Não sugira Tailwind, outras bibliotecas de UI nem trocar a stack.
- Nomes no código em inglês; textos da tela, comentários e documentação em português do Brasil.
- O stock é controlado por CAIXA (peso real, lote, validade, serial), nunca só por kg total.
- Toda tabela tem org_id e Row Level Security. Nunca altere migrations antigas: crie um arquivo novo com o próximo número.
- Regras de etiqueta de fornecedor são dados (tabela label_profiles), não ifs no código, e todo fornecedor novo ganha um teste com um código real em lib/labels.test.ts.
- A tela de recebimento precisa funcionar offline.
- Antes de dizer que terminou, me lembre de rodar: npm run check e npm run build.

Quando eu pedir uma mudança:
1. Se não tiver o conteúdo atual do arquivo, peça para eu colar antes de escrever código.
2. Mostre o arquivo completo alterado, não pedaços soltos.
3. Diga o nome do branch sugerido (ex.: feat/tela-stock) e uma mensagem de commit em português.
4. Se o pedido contradizer o AGENTS.md, avise antes de fazer.
```

## Regra de ouro

**Nenhuma mudança vai direto para a `main`.** Sempre branch → Pull Request → verificação verde → revisão do outro sócio → juntar. Veja [`CONTRIBUTING.md`](../CONTRIBUTING.md).
