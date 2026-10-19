// Histórico de alterações: transforma cada registro do banco numa frase legível. Lógica pura, para testar.

export type AuditRow = {
  id: number;
  table_name: string;
  row_id: string | null;
  label: string | null;
  action: "insert" | "update" | "delete";
  changed_at: string;
  changes: Record<string, unknown>;
  note: string | null;
  who: string;
};

const TABLE: Record<string, string> = {
  invoices: "invoice",
  credit_notes: "credit note",
  payments: "recebimento",
  bills: "conta a pagar",
  bill_payments: "pagamento de conta",
  sales_orders: "pedido",
  journal_entries: "lançamento manual",
  customers: "cliente",
  suppliers: "fornecedor",
  products: "produto",
  customer_prices: "preço especial",
  accounts: "conta do plano",
  organizations: "dados da empresa",
  memberships: "membro da equipe",
  receipts: "entrega",
  receipt_costs: "custo da entrega",
  boxes: "caixa",
};

const VERB = { insert: "criou", update: "alterou", delete: "apagou" } as const;

const FIELD: Record<string, string> = {
  name: "Nome",
  legal_name: "Razão social",
  number: "Número",
  status: "Situação",
  total: "Valor sem VAT",
  vat_total: "VAT",
  net: "Valor sem VAT",
  vat_amount: "VAT",
  vat_rate: "Taxa de VAT",
  amount: "Valor",
  price_kg: "Preço por kg",
  default_price_kg: "Preço por kg",
  credit_limit: "Limite de crédito",
  extra_costs: "Custos extras",
  issued_on: "Data",
  due_on: "Vencimento",
  paid_on: "Data do pagamento",
  entry_date: "Data",
  use_by: "Validade",
  packed_on: "Embalagem",
  net_weight_kg: "Peso",
  min_weight_kg: "Peso mínimo",
  max_weight_kg: "Peso máximo",
  lot: "Lote",
  reference: "Referência",
  description: "Descrição",
  payee: "Para quem",
  method: "Forma",
  note: "Observação",
  reason: "Motivo",
  role: "Papel",
  email: "Email",
  phone: "Telefone",
  address: "Endereço",
  vat_number: "Número de VAT",
  company_number: "Companies House",
  bank_name: "Banco",
  bank_account_name: "Titular da conta",
  sort_code: "Sort code",
  account_number: "Número da conta",
  invoice_notes: "Rodapé da invoice",
  books_locked_until: "Livro fechado até",
  active: "Ativo",
  code: "Código",
  gtin: "GTIN",
  product_id: "Produto",
  supplier_id: "Fornecedor",
  customer_id: "Cliente",
  account_id: "Categoria",
};

const STATUS: Record<string, string> = {
  draft: "rascunho",
  sent: "enviada",
  paid: "paga",
  void: "anulada",
  open: "aberta",
  confirmed: "confirmado",
  picking: "separando",
  shipped: "despachado",
  invoiced: "faturado",
  cancelled: "cancelado",
  in_stock: "em stock",
  reserved: "reservada",
  blocked: "bloqueada",
  written_off: "baixada",
  owner: "dono",
  admin: "admin",
  staff: "equipe",
};

const MONEY = new Set([
  "total",
  "vat_total",
  "net",
  "vat_amount",
  "amount",
  "price_kg",
  "default_price_kg",
  "credit_limit",
  "extra_costs",
]);
const HIDDEN = new Set(["id", "org_id", "created_at", "updated_at", "created_by", "received_by", "raw_barcode"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const gbp = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "GBP" });

/** Valor de um campo em texto curto. */
export function fieldValue(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "vazio";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (MONEY.has(key) && !Number.isNaN(Number(v))) return gbp(Number(v));
  if (key === "vat_rate") return `${Number(v)}%`;
  if (key.endsWith("_kg") && !Number.isNaN(Number(v)))
    return `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg`;
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split("-").reverse().join("/");
    if (STATUS[v] && (key === "status" || key === "role")) return STATUS[v];
    if (UUID.test(v)) return "outro";
    return v.length > 80 ? v.slice(0, 77) + "…" : v;
  }
  return String(v);
}

/** Uma linha de detalhe por campo. Ids internos não aparecem; troca de id vira "alterado". */
export function changeLines(row: Pick<AuditRow, "action" | "changes">, max = 8): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(row.changes ?? {})) {
    if (HIDDEN.has(k)) continue;
    const label = FIELD[k] ?? k;
    if (row.action === "update" && Array.isArray(v) && v.length === 2) {
      const [a, b] = v;
      if ((typeof a === "string" && UUID.test(a)) || (typeof b === "string" && UUID.test(b))) {
        out.push(`${label}: alterado`);
      } else {
        out.push(`${label}: ${fieldValue(k, a)} → ${fieldValue(k, b)}`);
      }
    } else if (row.action !== "update") {
      if (typeof v === "string" && UUID.test(v)) continue;
      if (!FIELD[k]) continue; // na criação, só os campos que a gente sabe nomear
      out.push(`${label}: ${fieldValue(k, v)}`);
    }
  }
  if (out.length > max) return [...out.slice(0, max), `e mais ${out.length - max}`];
  return out;
}

/** Frase principal: "Túlio alterou produto Picanha". Fechar e reabrir o mês têm frase própria. */
export function describe(row: AuditRow): string {
  const who = row.who.includes("@") ? row.who.split("@")[0] : row.who;
  const lock = row.changes?.books_locked_until;
  if (row.table_name === "organizations" && Array.isArray(lock)) {
    const until = lock[1] as string | null;
    return until ? `${who} fechou o livro até ${fieldValue("x", until)}` : `${who} reabriu todos os meses`;
  }
  if (row.table_name === "memberships") {
    const verb = { insert: "adicionou à equipe", update: "mudou o papel de", delete: "removeu da equipe" }[row.action];
    return `${who} ${verb} ${row.label ?? ""}`.trim();
  }
  const what = TABLE[row.table_name] ?? row.table_name;
  return `${who} ${VERB[row.action]} ${what}${row.label ? ` ${row.label}` : ""}`;
}

/** "19/10/2026 10:42" no fuso do aparelho. */
export function when(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
