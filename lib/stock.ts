// Stock por produto e ordem de saída das caixas (FEFO: vence primeiro, sai primeiro).
// Lógica pura, sem tela, para poder testar.
import { daysUntil } from "./labels.ts";

export type BoxStatus = "in_stock" | "reserved" | "shipped" | "blocked" | "written_off";

export type StockBox = {
  id: string;
  product_id: string;
  net_weight_kg: number | string;
  lot: string | null;
  use_by: string | null; // YYYY-MM-DD
  status: BoxStatus;
  serial: string | null;
  location: string | null;
};

export type StockProduct = { id: string; name: string; supplier: string | null };

/** Situação da caixa como a pessoa precisa ver na câmara. */
export type BoxState = "sai-primeiro" | "ok" | "vence-logo" | "vencida" | "bloqueada" | "reservada";

export type BoxView = StockBox & { kg: number; days: number | null; state: BoxState };

export type ProductSummary = StockProduct & {
  available: number; // caixas que podem ser vendidas
  availableKg: number;
  nextUseBy: string | null; // validade da próxima caixa a sair
  expiringSoon: number; // vencem em até 14 dias
  blocked: number; // bloqueadas ou vencidas
};

export const EXPIRING_DAYS = 14;

const toKg = (v: number | string) => (typeof v === "number" ? v : Number(v));

/** Pode ser vendida: em stock e dentro da validade (ou sem validade). */
export function isAvailable(box: StockBox, today = new Date()): boolean {
  if (box.status !== "in_stock") return false;
  const d = daysUntil(box.use_by, today);
  return d === null || d >= 0;
}

/** Caixas de um produto na ordem de saída. As que podem ser vendidas vêm primeiro, por validade. */
export function fefo(boxes: StockBox[], today = new Date()): BoxView[] {
  const views = boxes
    .filter(b => b.status === "in_stock" || b.status === "reserved" || b.status === "blocked")
    .map((b): BoxView => {
      const days = daysUntil(b.use_by, today);
      let state: BoxState;
      if (b.status === "blocked") state = "bloqueada";
      else if (days !== null && days < 0) state = "vencida";
      else if (b.status === "reserved") state = "reservada";
      else if (days !== null && days <= EXPIRING_DAYS) state = "vence-logo";
      else state = "ok";
      return { ...b, kg: toKg(b.net_weight_kg), days, state };
    });

  const rank = (v: BoxView) => (v.state === "ok" || v.state === "vence-logo" ? 0 : v.state === "reservada" ? 1 : 2);
  views.sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r) return r;
    // Sem validade vai para o fim do grupo
    const da = a.days ?? Number.POSITIVE_INFINITY;
    const db = b.days ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return (a.serial ?? "").localeCompare(b.serial ?? "");
  });

  const first = views.find(v => v.state === "ok" || v.state === "vence-logo");
  if (first && first.state === "ok") first.state = "sai-primeiro";
  return views;
}

/** Resumo de cada produto. Produtos com caixas disponíveis primeiro, depois por nome. */
export function summarize(products: StockProduct[], boxes: StockBox[], today = new Date()): ProductSummary[] {
  const byProduct = new Map<string, StockBox[]>();
  for (const b of boxes) {
    const list = byProduct.get(b.product_id) ?? [];
    list.push(b);
    byProduct.set(b.product_id, list);
  }

  const out = products.map(p => {
    const list = byProduct.get(p.id) ?? [];
    const avail = list.filter(b => isAvailable(b, today));
    const blocked = list.filter(b => b.status === "blocked" || (b.status === "in_stock" && !isAvailable(b, today)));
    const nextUseBy =
      avail
        .map(b => b.use_by)
        .filter((d): d is string => !!d)
        .sort()[0] ?? null;
    return {
      ...p,
      available: avail.length,
      availableKg: Math.round(avail.reduce((s, b) => s + toKg(b.net_weight_kg), 0) * 1000) / 1000,
      nextUseBy,
      expiringSoon: avail.filter(b => {
        const d = daysUntil(b.use_by, today);
        return d !== null && d <= EXPIRING_DAYS;
      }).length,
      blocked: blocked.length,
    };
  });

  return out.sort((a, b) => {
    const has = Number(b.available > 0 || b.blocked > 0) - Number(a.available > 0 || a.blocked > 0);
    return has || a.name.localeCompare(b.name, "pt-BR");
  });
}

/** Busca por nome do produto, fornecedor, lote ou número da caixa. */
export function matches(p: StockProduct, boxes: StockBox[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (p.name.toLowerCase().includes(q) || (p.supplier ?? "").toLowerCase().includes(q)) return true;
  return boxes.some(
    b => b.product_id === p.id && ((b.lot ?? "").toLowerCase().includes(q) || (b.serial ?? "").includes(q)),
  );
}
