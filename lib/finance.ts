// Consultas do financeiro no Supabase: plano de contas e contas a pagar.
import { supabase } from "./supabase";
import type { BillRow } from "./payables";
import type { Payment } from "./sales";
import type { AccountTotal, VatSums } from "./reports";
import type { MarginRow } from "./costing";
import type { AuditRow } from "./audit";

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
export type Account = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  system_key: string | null;
  active: boolean;
};

export const ACCOUNT_TYPE: Record<AccountType, string> = {
  asset: "Ativo",
  liability: "Passivo",
  equity: "Patrimônio",
  income: "Receita",
  expense: "Despesa",
};

export type BillSummary = {
  id: string;
  reference: string | null;
  issued_on: string;
  due_on: string | null;
  status: "open" | "paid" | "void";
  description: string | null;
  payee: string;
  account: string;
  gross: number;
  paid: number;
  balance: number;
};

export type BillDetail = BillSummary & {
  net: number;
  vat_rate: number;
  vat_amount: number;
  payments: Payment[];
};

export async function listAccounts(orgId: string): Promise<Account[]> {
  const { data, error } = await supabase()
    .from("accounts")
    .select("id, code, name, type, system_key, active")
    .eq("org_id", orgId)
    .order("code");
  if (error) throw error;
  return (data ?? []) as Account[];
}

export async function saveAccount(
  orgId: string,
  id: string | null,
  row: { code: string; name: string; type: AccountType; active: boolean },
): Promise<void> {
  const sb = supabase();
  const { error } = id
    ? await sb.from("accounts").update(row).eq("id", id).eq("org_id", orgId)
    : await sb.from("accounts").insert({ ...row, org_id: orgId });
  if (error) throw error;
}

const num = (r: Record<string, unknown>, ...keys: string[]) => {
  const out = { ...r };
  for (const k of keys) out[k] = Number(r[k]);
  return out;
};

export async function listBills(orgId: string, onlyOpen: boolean): Promise<BillSummary[]> {
  let q = supabase()
    .from("bill_balances")
    .select("id, reference, issued_on, due_on, status, description, payee, account, gross, paid, balance")
    .eq("org_id", orgId);
  if (onlyOpen) q = q.gt("balance", 0);
  const { data, error } = await q.order("due_on", { ascending: true, nullsFirst: false }).limit(500);
  if (error) throw error;
  return (data ?? []).map(r => num(r, "gross", "paid", "balance")) as BillSummary[];
}

export async function createBill(orgId: string, row: BillRow): Promise<string> {
  const { data: s } = await supabase().auth.getSession();
  const { data, error } = await supabase()
    .from("bills")
    .insert({ ...row, org_id: orgId, created_by: s.session?.user.id ?? null })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function getBill(billId: string): Promise<BillDetail> {
  const sb = supabase();
  const [sum, raw, pays] = await Promise.all([
    sb
      .from("bill_balances")
      .select("id, reference, issued_on, due_on, status, description, payee, account, gross, paid, balance")
      .eq("id", billId)
      .maybeSingle(),
    sb.from("bills").select("net, vat_rate, vat_amount, status").eq("id", billId).single(),
    sb.from("bill_payments").select("id, amount, paid_on, method, note").eq("bill_id", billId).order("paid_on"),
  ]);
  if (raw.error) throw raw.error;
  if (sum.error) throw sum.error;
  if (pays.error) throw pays.error;
  // Conta anulada não aparece na view de saldos
  const base = sum.data
    ? (num(sum.data, "gross", "paid", "balance") as BillSummary)
    : ({
        id: billId,
        reference: null,
        issued_on: "",
        due_on: null,
        status: "void",
        description: null,
        payee: "—",
        account: "—",
        gross: 0,
        paid: 0,
        balance: 0,
      } as BillSummary);
  return {
    ...base,
    status: raw.data.status,
    net: Number(raw.data.net),
    vat_rate: Number(raw.data.vat_rate),
    vat_amount: Number(raw.data.vat_amount),
    payments: (pays.data ?? []).map(p => ({ ...p, amount: Number(p.amount) })) as Payment[],
  };
}

export async function recordBillPayment(
  billId: string,
  p: { amount: number; paid_on: string; method: string; note: string },
): Promise<void> {
  const { error } = await supabase().rpc("record_bill_payment", {
    bill_id: billId,
    amount: p.amount,
    paid_on: p.paid_on,
    method: p.method,
    note: p.note,
  });
  if (error) throw error;
}

/** Anula uma conta lançada errado. Só sem pagamentos. */
export async function voidBill(orgId: string, billId: string): Promise<void> {
  const sb = supabase();
  const { count } = await sb.from("bill_payments").select("id", { count: "exact", head: true }).eq("bill_id", billId);
  if (count) throw { message: "Esta conta já tem pagamento registrado e não pode ser anulada." };
  const { error } = await sb.from("bills").update({ status: "void" }).eq("id", billId).eq("org_id", orgId);
  if (error) throw error;
}

export type JournalEntry = {
  id: string;
  entry_date: string;
  description: string;
  source_table: string | null;
  source_id: string | null;
  lines: { account: string; code: string; debit: number; credit: number; memo: string | null }[];
};

/** Lançamentos de um período, mais recentes primeiro. */
export async function listEntries(orgId: string, from: string, to: string): Promise<JournalEntry[]> {
  const { data, error } = await supabase()
    .from("journal_entries")
    .select(
      "id, entry_date, description, source_table, source_id, created_at, journal_lines(debit, credit, memo, accounts(code, name))",
    )
    .eq("org_id", orgId)
    .gte("entry_date", from)
    .lte("entry_date", to)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  type Raw = {
    id: string;
    entry_date: string;
    description: string;
    source_table: string | null;
    source_id: string | null;
    journal_lines: {
      debit: number;
      credit: number;
      memo: string | null;
      accounts: { code: string; name: string } | null;
    }[];
  };
  return ((data ?? []) as unknown as Raw[]).map(e => ({
    id: e.id,
    entry_date: e.entry_date,
    description: e.description,
    source_table: e.source_table,
    source_id: e.source_id,
    lines: e.journal_lines
      .map(l => ({
        account: l.accounts?.name ?? "Conta",
        code: l.accounts?.code ?? "",
        debit: Number(l.debit),
        credit: Number(l.credit),
        memo: l.memo,
      }))
      .sort((a, b) => b.debit - a.debit),
  }));
}

export async function postManualEntry(
  orgId: string,
  entryDate: string,
  description: string,
  lines: { account_id: string; debit: number; credit: number }[],
): Promise<void> {
  const { error } = await supabase().rpc("post_manual_entry", {
    target_org: orgId,
    entry_date: entryDate,
    description,
    lines,
  });
  if (error) throw error;
}

export async function accountTotals(orgId: string, from: string | null, to: string): Promise<AccountTotal[]> {
  const { data, error } = await supabase().rpc("report_account_totals", {
    target_org: orgId,
    date_from: from,
    date_to: to,
  });
  if (error) throw error;
  return ((data ?? []) as AccountTotal[]).map(r => ({ ...r, debit: Number(r.debit), credit: Number(r.credit) }));
}

export async function vatSums(orgId: string, from: string, to: string): Promise<VatSums> {
  const { data, error } = await supabase().rpc("report_vat", { target_org: orgId, date_from: from, date_to: to });
  if (error) throw error;
  const r = ((data ?? []) as Record<string, number>[])[0] ?? {};
  const n = (k: string) => Number(r[k] ?? 0);
  return {
    sales_net: n("sales_net"),
    sales_vat: n("sales_vat"),
    credits_net: n("credits_net"),
    credits_vat: n("credits_vat"),
    purchases_net: n("purchases_net"),
    purchases_vat: n("purchases_vat"),
  };
}

export type ReceiptSummary = {
  id: string;
  received_at: string;
  reference: string | null;
  extra_costs: number;
  costed_at: string | null;
  boxes: number;
  weight_kg: number;
  products: string[];
};

export type ReceiptProductRow = {
  product_id: string;
  product: string;
  boxes: number;
  weight_kg: number;
  price_kg: number | null;
};

/** Entregas recebidas (as mais recentes primeiro), com caixas e kg. */
export async function listReceipts(orgId: string): Promise<ReceiptSummary[]> {
  const sb = supabase();
  const [rec, prod] = await Promise.all([
    sb
      .from("receipts")
      .select("id, received_at, reference, extra_costs, costed_at")
      .eq("org_id", orgId)
      .order("received_at", { ascending: false })
      .limit(200),
    sb.from("receipt_products").select("receipt_id, product, boxes, weight_kg").eq("org_id", orgId).limit(5000),
  ]);
  if (rec.error) throw rec.error;
  if (prod.error) throw prod.error;
  return (rec.data ?? [])
    .map(r => {
      const items = (prod.data ?? []).filter(p => p.receipt_id === r.id);
      return {
        ...r,
        extra_costs: Number(r.extra_costs),
        boxes: items.reduce((s, p) => s + Number(p.boxes), 0),
        weight_kg: items.reduce((s, p) => s + Math.round(Number(p.weight_kg) * 1000), 0) / 1000,
        products: items.map(p => p.product as string),
      };
    })
    .filter(r => r.boxes > 0);
}

export async function getReceipt(
  receiptId: string,
): Promise<{ summary: Omit<ReceiptSummary, "boxes" | "weight_kg" | "products">; rows: ReceiptProductRow[] }> {
  const sb = supabase();
  const [rec, prod] = await Promise.all([
    sb.from("receipts").select("id, received_at, reference, extra_costs, costed_at").eq("id", receiptId).single(),
    sb.from("receipt_products").select("product_id, product, boxes, weight_kg, price_kg").eq("receipt_id", receiptId),
  ]);
  if (rec.error) throw rec.error;
  if (prod.error) throw prod.error;
  return {
    summary: { ...rec.data, extra_costs: Number(rec.data.extra_costs) },
    rows: (prod.data ?? [])
      .map(p => ({
        product_id: p.product_id,
        product: p.product,
        boxes: Number(p.boxes),
        weight_kg: Number(p.weight_kg),
        price_kg: p.price_kg === null ? null : Number(p.price_kg),
      }))
      .sort((a, b) => a.product.localeCompare(b.product)),
  };
}

export async function saveReceiptCosts(
  receiptId: string,
  prices: { product_id: string; price_kg: number }[],
  extras: number,
  reference: string,
): Promise<void> {
  const { error } = await supabase().rpc("set_receipt_costs", {
    receipt: receiptId,
    prices,
    extras,
    ref: reference,
  });
  if (error) throw error;
}

export async function marginRows(orgId: string, from: string, to: string): Promise<MarginRow[]> {
  const { data, error } = await supabase()
    .from("sale_margins")
    .select(
      "invoice_id, customer_id, customer, product_id, product, boxes, weight_kg, revenue, cost, boxes_without_cost",
    )
    .eq("org_id", orgId)
    .gte("issued_on", from)
    .lte("issued_on", to)
    .limit(5000);
  if (error) throw error;
  return (data ?? []).map(r => ({
    ...r,
    boxes: Number(r.boxes),
    weight_kg: Number(r.weight_kg),
    revenue: Number(r.revenue),
    cost: r.cost === null ? null : Number(r.cost),
    boxes_without_cost: Number(r.boxes_without_cost),
  })) as MarginRow[];
}

export async function marginForInvoice(invoiceId: string): Promise<MarginRow[]> {
  const { data, error } = await supabase()
    .from("sale_margins")
    .select(
      "invoice_id, customer_id, customer, product_id, product, boxes, weight_kg, revenue, cost, boxes_without_cost",
    )
    .eq("invoice_id", invoiceId);
  if (error) throw error;
  return (data ?? []).map(r => ({
    ...r,
    revenue: Number(r.revenue),
    cost: r.cost === null ? null : Number(r.cost),
    boxes: Number(r.boxes),
    weight_kg: Number(r.weight_kg),
    boxes_without_cost: Number(r.boxes_without_cost),
  })) as MarginRow[];
}

export async function stockValue(
  orgId: string,
): Promise<{ value: number; boxes: number; boxes_without_cost: number; weight_kg: number }> {
  const { data, error } = await supabase()
    .from("stock_value")
    .select("value, boxes, boxes_without_cost, weight_kg")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return {
    value: Number(data?.value ?? 0),
    boxes: Number(data?.boxes ?? 0),
    boxes_without_cost: Number(data?.boxes_without_cost ?? 0),
    weight_kg: Number(data?.weight_kg ?? 0),
  };
}

// ---------- Fechamento do mês e histórico ----------

/** Último dia fechado do livro ("AAAA-MM-DD") ou null. */
export async function getBooksLock(orgId: string): Promise<string | null> {
  const { data, error } = await supabase().from("organizations").select("books_locked_until").eq("id", orgId).single();
  if (error) throw error;
  return (data as { books_locked_until: string | null }).books_locked_until;
}

export async function closeBooks(orgId: string, until: string): Promise<void> {
  const { error } = await supabase().rpc("close_books", { target_org: orgId, until });
  if (error) throw error;
}

export async function reopenBooks(orgId: string, until: string | null, reason: string): Promise<void> {
  const { error } = await supabase().rpc("reopen_books", { target_org: orgId, until, reason });
  if (error) throw error;
}

export async function listAudit(orgId: string, beforeId: number | null, max = 50): Promise<AuditRow[]> {
  const { data, error } = await supabase().rpc("list_audit", {
    target_org: orgId,
    before_id: beforeId,
    max_rows: max,
  });
  if (error) throw error;
  return (data ?? []) as AuditRow[];
}
