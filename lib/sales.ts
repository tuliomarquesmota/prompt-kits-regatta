// Consultas de vendas no Supabase (pedidos, clientes, expedição e invoices).
import { supabase } from "./supabase";
import type { StockBox } from "./stock";
import type { OrderLine } from "./dispatch";

export type Customer = {
  id: string;
  name: string;
  email: string | null;
  payment_terms: number;
  credit_limit: number | null;
};

export type OrderSummary = {
  id: string;
  number: string;
  status: "draft" | "confirmed" | "picking" | "shipped" | "invoiced" | "cancelled";
  created_at: string;
  delivery_on: string | null;
  customer: string;
  items: string;
  invoice: { id: string; number: string; total: number } | null;
};

export type OrderDetail = {
  id: string;
  number: string;
  status: OrderSummary["status"];
  customer: string;
  lines: OrderLine[];
};

export type InvoiceDetail = {
  id: string;
  number: string;
  issued_on: string;
  due_on: string | null;
  total: number;
  status: string;
  customer: { name: string; email: string | null };
  order: string | null;
  lines: { product: string; boxes: number; weight_kg: number; price_kg: number; amount: number; lots: string[] }[];
};

export const ORDER_STATUS: Record<OrderSummary["status"], { text: string; tone: string }> = {
  draft: { text: "Rascunho", tone: "info" },
  confirmed: { text: "A expedir", tone: "warn" },
  picking: { text: "Separando", tone: "warn" },
  shipped: { text: "Expedido", tone: "ok" },
  invoiced: { text: "Faturado", tone: "ok" },
  cancelled: { text: "Cancelado", tone: "bad" },
};

export const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "GBP" });
export const kgText = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + " kg";
export const brDate = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

type Named = { name: string } | null;
const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export async function listCustomers(orgId: string): Promise<Customer[]> {
  const { data, error } = await supabase()
    .from("customers")
    .select("id, name, email, payment_terms, credit_limit")
    .eq("org_id", orgId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/** Cria (id null) ou atualiza um cliente. */
export async function saveCustomer(orgId: string, id: string | null, c: Omit<Customer, "id">): Promise<void> {
  const sb = supabase();
  const { error } = id
    ? await sb.from("customers").update(c).eq("id", id).eq("org_id", orgId)
    : await sb.from("customers").insert({ org_id: orgId, ...c });
  if (error) throw error;
}

export async function listProducts(orgId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase().from("products").select("id, name").eq("org_id", orgId).order("name");
  if (error) throw error;
  return data ?? [];
}

/** Último preço por kg usado para este cliente, por produto. */
export async function customerPrices(customerId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase()
    .from("customer_prices")
    .select("product_id, price_kg")
    .eq("customer_id", customerId);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map(r => [r.product_id, Number(r.price_kg)]));
}

export async function createOrder(
  orgId: string,
  customerId: string,
  lines: { product_id: string; boxes: number; price_kg: number }[],
  delivery: string | null,
): Promise<string> {
  const { data, error } = await supabase().rpc("create_sales_order", {
    target_org: orgId,
    customer: customerId,
    lines,
    delivery,
  });
  if (error) throw error;
  return data as string;
}

export async function listOrders(orgId: string): Promise<OrderSummary[]> {
  const { data, error } = await supabase()
    .from("sales_orders")
    .select(
      "id, number, status, created_at, delivery_on, customers(name), sales_order_lines(boxes_requested, products(name)), shipments(invoices(id, number, total))",
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map(o => {
    const lines = (o.sales_order_lines ?? []) as unknown as { boxes_requested: number; products: Named }[];
    const ship = one(o.shipments as unknown as { invoices: unknown }[]);
    const inv = ship ? one(ship.invoices as { id: string; number: string; total: number }[]) : null;
    return {
      id: o.id,
      number: o.number,
      status: o.status,
      created_at: o.created_at,
      delivery_on: o.delivery_on,
      customer: one(o.customers as unknown as Named)?.name ?? "—",
      items: lines.map(l => `${l.products?.name ?? "Produto"} ×${l.boxes_requested}`).join(", "),
      invoice: inv ? { ...inv, total: Number(inv.total) } : null,
    };
  });
}

export async function getOrder(orderId: string): Promise<OrderDetail> {
  const { data, error } = await supabase()
    .from("sales_orders")
    .select(
      "id, number, status, customers(name), sales_order_lines(product_id, boxes_requested, price_kg, products(name))",
    )
    .eq("id", orderId)
    .single();
  if (error) throw error;
  const lines = (data.sales_order_lines ?? []) as unknown as {
    product_id: string;
    boxes_requested: number;
    price_kg: number;
    products: Named;
  }[];
  return {
    id: data.id,
    number: data.number,
    status: data.status,
    customer: one(data.customers as unknown as Named)?.name ?? "—",
    lines: lines.map(l => ({
      product_id: l.product_id,
      product_name: l.products?.name ?? "Produto",
      boxes_requested: l.boxes_requested,
      price_kg: Number(l.price_kg),
    })),
  };
}

type BoxRow = {
  id: string;
  product_id: string;
  net_weight_kg: number;
  lot: string | null;
  use_by: string | null;
  status: StockBox["status"];
  serial: string | null;
  locations: Named;
};
const toBox = (b: BoxRow): StockBox => ({
  id: b.id,
  product_id: b.product_id,
  net_weight_kg: b.net_weight_kg,
  lot: b.lot,
  use_by: b.use_by,
  status: b.status,
  serial: b.serial,
  location: one(b.locations)?.name ?? null,
});
const BOX_COLS = "id, product_id, net_weight_kg, lot, use_by, status, serial, locations(name)";

/** Caixas em stock dos produtos do pedido, para a lista de separação. */
export async function boxesForProducts(orgId: string, productIds: string[]): Promise<StockBox[]> {
  if (productIds.length === 0) return [];
  const { data, error } = await supabase()
    .from("boxes")
    .select(BOX_COLS)
    .eq("org_id", orgId)
    .in("product_id", productIds)
    .eq("status", "in_stock")
    .order("use_by", { ascending: true, nullsFirst: false })
    .limit(1000);
  if (error) throw error;
  return ((data ?? []) as unknown as BoxRow[]).map(toBox);
}

/** Encontra a caixa bipada pelo código do produto e número da caixa. */
export async function findBox(orgId: string, productKey: string, serial: string): Promise<StockBox | null> {
  const { data, error } = await supabase()
    .from("boxes")
    .select(BOX_COLS)
    .eq("org_id", orgId)
    .eq("gtin", productKey)
    .eq("serial", serial)
    .maybeSingle();
  if (error) throw error;
  return data ? toBox(data as unknown as BoxRow) : null;
}

export async function shipOrder(orderId: string, boxIds: string[]): Promise<string> {
  const { data, error } = await supabase().rpc("ship_order", { order_id: orderId, box_ids: boxIds });
  if (error) throw error;
  return data as string;
}

export async function getInvoice(invoiceId: string): Promise<InvoiceDetail> {
  const { data, error } = await supabase()
    .from("invoices")
    .select(
      "id, number, issued_on, due_on, total, status, customers(name, email), shipments(sales_orders(number)), invoice_lines(boxes, weight_kg, price_kg, amount, lots, products(name))",
    )
    .eq("id", invoiceId)
    .single();
  if (error) throw error;
  const cust = one(data.customers as unknown as { name: string; email: string | null });
  const ship = one(data.shipments as unknown as { sales_orders: unknown });
  const so = ship ? one(ship.sales_orders as { number: string }) : null;
  const lines = (data.invoice_lines ?? []) as unknown as {
    boxes: number;
    weight_kg: number;
    price_kg: number;
    amount: number;
    lots: string[] | null;
    products: Named;
  }[];
  return {
    id: data.id,
    number: data.number,
    issued_on: data.issued_on,
    due_on: data.due_on,
    total: Number(data.total),
    status: data.status,
    customer: { name: cust?.name ?? "—", email: cust?.email ?? null },
    order: so?.number ?? null,
    lines: lines.map(l => ({
      product: l.products?.name ?? "Produto",
      boxes: l.boxes,
      weight_kg: Number(l.weight_kg),
      price_kg: Number(l.price_kg),
      amount: Number(l.amount),
      lots: l.lots ?? [],
    })),
  };
}

/** Traduz os erros do banco para frases que a pessoa entende. */
export function errorText(e: unknown): string {
  const m = (e as { message?: string })?.message ?? "";
  if (/fetch|network|Failed to fetch/i.test(m))
    return "Sem internet. Vendas precisam de conexão; tente de novo quando conectar.";
  return m || "Algo deu errado. Tente de novo.";
}
