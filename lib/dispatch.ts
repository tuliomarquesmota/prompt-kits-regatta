// Expedição: decide se uma caixa bipada pode sair num pedido e monta a prévia da invoice.
// Lógica pura, sem tela, para poder testar. O banco confere tudo de novo ao expedir (ship_order).
import { isAvailable, type StockBox } from "./stock.ts";

export type OrderLine = {
  product_id: string;
  product_name: string;
  boxes_requested: number;
  price_kg: number;
};

export type PickResult =
  | { ok: true; over: boolean } // over: passou da quantidade pedida (permitido, mas avisa)
  | { ok: false; reason: string };

export function checkPick(lines: OrderLine[], picked: StockBox[], box: StockBox, today = new Date()): PickResult {
  if (picked.some(p => p.id === box.id)) return { ok: false, reason: "Esta caixa já está na lista." };
  const line = lines.find(l => l.product_id === box.product_id);
  if (!line) return { ok: false, reason: "Este produto não está no pedido." };
  if (box.status === "shipped") return { ok: false, reason: "Esta caixa já foi vendida." };
  if (box.status === "blocked") return { ok: false, reason: "Caixa bloqueada: não pode ser vendida." };
  if (!isAvailable(box, today)) return { ok: false, reason: "Caixa vencida: não pode ser vendida." };
  const already = picked.filter(p => p.product_id === box.product_id).length;
  return { ok: true, over: already + 1 > line.boxes_requested };
}

export type PreviewLine = {
  product_id: string;
  product_name: string;
  requested: number;
  boxes: number;
  weightKg: number;
  priceKg: number;
  amount: number; // em libras, 2 casas, igual ao banco
  lots: string[];
};

/** Mesma conta do banco: soma dos pesos reais × preço por kg, arredondada a 2 casas. */
export function lineAmount(weightKg: number, priceKg: number): number {
  const grams = Math.round(weightKg * 1000);
  const pence = Math.round(priceKg * 100);
  return Math.round((grams * pence) / 1000) / 100;
}

export function preview(lines: OrderLine[], picked: StockBox[]): { lines: PreviewLine[]; total: number } {
  const out = lines.map(l => {
    const boxes = picked.filter(p => p.product_id === l.product_id);
    const grams = boxes.reduce((s, b) => s + Math.round(Number(b.net_weight_kg) * 1000), 0);
    const weightKg = grams / 1000;
    return {
      product_id: l.product_id,
      product_name: l.product_name,
      requested: l.boxes_requested,
      boxes: boxes.length,
      weightKg,
      priceKg: l.price_kg,
      amount: lineAmount(weightKg, l.price_kg),
      lots: [...new Set(boxes.map(b => b.lot).filter((x): x is string => !!x))].sort(),
    };
  });
  const totalPence = out.reduce((s, l) => s + Math.round(l.amount * 100), 0);
  return { lines: out, total: totalPence / 100 };
}

/** Pedido completo quando cada produto tem pelo menos as caixas pedidas. */
export function isComplete(p: { lines: PreviewLine[] }): boolean {
  return p.lines.every(l => l.boxes >= l.requested);
}
