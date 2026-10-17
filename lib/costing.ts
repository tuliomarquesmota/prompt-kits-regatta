// Custo por caixa (landed cost) e margem. Lógica pura, para testar.
// Mesma conta do banco (set_receipt_costs): custo/kg = preço do fornecedor + extras ÷ kg da entrega.

export type ReceiptProduct = { product_id: string; product: string; boxes: number; weight_kg: number };

export type CostLine = ReceiptProduct & { price_kg: number | null; cost_kg: number | null; cost: number | null };

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Prévia do custo de cada produto da entrega. Produto sem preço fica sem custo. */
export function landedCosts(rows: ReceiptProduct[], prices: Record<string, number | null>, extras: number) {
  const grams = rows.reduce((s, r) => s + Math.round(Number(r.weight_kg) * 1000), 0);
  const totalKg = grams / 1000;
  const extraKg = totalKg > 0 ? r4(extras / totalKg) : 0;
  const lines: CostLine[] = rows.map(r => {
    const price = prices[r.product_id] ?? null;
    const costKg = price === null ? null : r4(price + extraKg);
    return { ...r, price_kg: price, cost_kg: costKg, cost: costKg === null ? null : r2(Number(r.weight_kg) * costKg) };
  });
  const total = lines.reduce((s, l) => s + Math.round((l.cost ?? 0) * 100), 0) / 100;
  return { lines, totalKg, extraKg, total, missing: lines.filter(l => l.price_kg === null).length };
}

export type MarginRow = {
  invoice_id: string;
  customer_id: string;
  customer: string;
  product_id: string;
  product: string;
  boxes: number;
  weight_kg: number;
  revenue: number;
  cost: number | null;
  boxes_without_cost: number;
};

export type MarginGroup = {
  key: string;
  name: string;
  boxes: number;
  weightKg: number;
  revenue: number;
  cost: number;
  margin: number;
  pct: number | null;
  withoutCost: number;
};

/** Margem agrupada por produto ou por cliente. Caixas sem custo ficam fora da margem e são contadas à parte. */
export function marginBy(rows: MarginRow[], by: "product" | "customer"): { groups: MarginGroup[]; total: MarginGroup } {
  const map = new Map<string, MarginGroup>();
  const add = (g: MarginGroup, r: MarginRow) => {
    g.boxes += Number(r.boxes);
    g.weightKg = Math.round((g.weightKg + Number(r.weight_kg)) * 1000) / 1000;
    g.withoutCost += Number(r.boxes_without_cost);
    // Só entra na margem a linha que tem custo de todas as caixas
    if (Number(r.boxes_without_cost) === 0 && r.cost !== null) {
      g.revenue = (Math.round(g.revenue * 100) + Math.round(Number(r.revenue) * 100)) / 100;
      g.cost = (Math.round(g.cost * 100) + Math.round(Number(r.cost) * 100)) / 100;
    }
  };
  const blank = (key: string, name: string): MarginGroup => ({
    key,
    name,
    boxes: 0,
    weightKg: 0,
    revenue: 0,
    cost: 0,
    margin: 0,
    pct: null,
    withoutCost: 0,
  });
  const total = blank("total", "Total");
  for (const r of rows) {
    const key = by === "product" ? r.product_id : r.customer_id;
    const g = map.get(key) ?? blank(key, by === "product" ? r.product : r.customer);
    add(g, r);
    add(total, r);
    map.set(key, g);
  }
  const finish = (g: MarginGroup): MarginGroup => {
    const margin = (Math.round(g.revenue * 100) - Math.round(g.cost * 100)) / 100;
    return { ...g, margin, pct: g.revenue ? Math.round((margin / g.revenue) * 1000) / 10 : null };
  };
  return {
    groups: [...map.values()].map(finish).sort((a, b) => b.margin - a.margin),
    total: finish(total),
  };
}
