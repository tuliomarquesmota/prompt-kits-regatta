# LOTE · Recebimento (fase 1)

App de celular para receber caixas de carne por scan, **com ou sem internet**.
Lê a etiqueta do frigorífico, registra peso, lote, validade e número da caixa, e manda tudo para o banco quando houver conexão.

> **Antes de mexer no código, leia:**
>
> - [`AGENTS.md`](AGENTS.md): as regras do projeto, para pessoas e para qualquer IA (Claude, ChatGPT)
> - [`CONTRIBUTING.md`](CONTRIBUTING.md): como trabalhamos (branch → Pull Request → revisão)
> - [`docs/usar-com-ia.md`](docs/usar-com-ia.md): como configurar o Claude ou o ChatGPT para seguir as regras
> - [`docs/plano.md`](docs/plano.md) e [`docs/etiquetas.md`](docs/etiquetas.md): plano de fases e etiquetas dos fornecedores

## O que já funciona

- **Login e empresas**: cada empresa só vê os próprios dados (Row Level Security no banco)
- **Câmera ao vivo**: aponta para a etiqueta e a caixa é registrada; bipe e vibração confirmam
- **Leitura por foto**, para quando a câmera ao vivo não conseguir focar
- **Perfis por fornecedor**: Teys (AU), Silver Fern (NZ) e Liffey (IE) já vêm cadastrados como exemplo
- **Offline**: o app abre sem internet, lê etiquetas com o catálogo salvo e guarda as caixas numa fila no celular. A fila é enviada sozinha quando a conexão volta
- **Sem duplicar**: a mesma caixa não entra duas vezes, nem lida por dois celulares diferentes
- **Caixa vencida** entra bloqueada para venda
- **API de stock** para o site da SA (substitui a consulta ao SOS Inventory)

## Como rodar

1. Crie um projeto em [supabase.com](https://supabase.com)
2. No Supabase, abra **SQL Editor** e rode, nesta ordem:
   - `supabase/migrations/001_schema.sql`
   - `supabase/migrations/002_recebimento.sql`
3. Copie `.env.example` para `.env.local` e preencha com os dados de **Project Settings › API**
4. No terminal:
   ```bash
   npm install
   npm test        # testa o leitor com as etiquetas reais
   npm run dev     # abre em http://localhost:3000
   ```
5. Crie uma conta, crie a empresa e marque "Carregar fornecedores e produtos de exemplo"

Para testar a câmera no celular, o app precisa de **https**. O jeito mais simples é publicar na Vercel
(conecte o repositório do GitHub e adicione as duas variáveis do `.env.local`).

O modo offline só liga na versão de produção (`npm run build && npm start`, ou na Vercel).
Abra o app uma vez com internet; depois disso ele funciona sem conexão. No celular, use "Adicionar à tela inicial".

## Estrutura

```
app/receber/page.tsx     tela de recebimento (câmera, cartão da caixa, lista da entrega)
app/login/page.tsx       login, escolha e criação de empresa
app/api/v1/stock/        API de stock para os sites
components/Scanner.tsx   câmera ao vivo (leitor nativo do Android ou ZXing) e leitura por foto
lib/labels.ts            leitor de etiquetas: GS1 e moldes por fornecedor
lib/labels.test.ts       testes com os códigos das etiquetas reais
lib/offline-db.ts        banco local do celular (catálogo e fila)
lib/catalog.ts           baixa perfis, produtos e locais para uso offline
lib/sync.ts              envia a fila para o Supabase
public/sw.js             service worker (abre o app sem internet)
supabase/migrations/     banco de dados
```

## Cadastrar um fornecedor novo

Cada fornecedor tem uma linha em `label_profiles`:

**GS1** (a maioria dos exportadores):

```json
match: {"tipo":"gs1","prefixo_gtin":"9332218"}
rules: {"shelf_dias":140,"lote":{"regra":"aaddd"},"peso_kg":[10,35]}
```

O prefixo é o que vem depois do primeiro dígito do código `(01)`.
`lote.regra`: `ai10` (o código traz o lote), `aaddd` (ano + dia do ano), `ddd` (prefixo + dia do ano).

**Código próprio** (lido por posição):

```json
match: {"tipo":"molde","chave":"liffey","padrao":"^\\d{10}$","produto":[0,4],"peso":[4,8],"casas":2,"serial_itf":true}
```

O produto correspondente tem `gtin = "liffey:5300"`.

Depois de cadastrar, adicione o caso em `lib/labels.test.ts` com um código real.

## API de stock para o site

1. Crie uma chave (no SQL Editor, logado como dono da empresa, ou depois por uma tela de configurações):
   ```sql
   select create_api_key('<id da empresa>', 'Site SA Global Meat');
   ```
   Guarde o texto que aparece: ele não é mostrado de novo.
2. O site consulta:
   ```bash
   curl -H "x-api-key: lote_..." https://SEU-APP.vercel.app/api/v1/stock
   ```
   ```json
   {
     "updated_at": "…",
     "products": [
       {
         "product": "Oyster Blade",
         "gtin": "99332218350849",
         "in_stock": true,
         "boxes": 12,
         "total_kg": 258.4,
         "next_use_by": "2026-11-15"
       }
     ]
   }
   ```

## Próximos passos

- Tela de stock por produto (cada caixa com peso e validade, FEFO)
- Cadastro de produtos e fornecedores pelo app
- "Ensinar etiqueta nova": foto + IA sugerindo o perfil
- Pedidos de venda, scan na expedição e invoice pelo peso real
- Integração com o QuickBooks
