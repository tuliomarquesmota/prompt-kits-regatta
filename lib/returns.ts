// Devolução: prévia da credit note, com a mesma conta do banco (return_boxes).
import { lineAmount } from "./dispatch.ts";

export type ShippedBox = {
  id: string;
  product_id: string;
  product_name: string;
  net_weight_kg: number;
  price_kg: number;
  lot: string | null;
  serial: string | null;
  returned: boolean;
};

export type CreditLine = { product_name: string; boxes: number; weightKg: number; priceKg: number; amount: number };

/** Agrupa as caixas escolhidas por produto e preço: peso real somado × preço por kg, 2 casas. */
export function creditPreview(boxes: ShippedBox[]): { lines: CreditLine[]; total: number } {
  const groups = new Map<string, ShippedBox[]>();
  for (const b of boxes) {
    const k = `${b.product_id}|${b.price_kg}`;
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  const lines = [...groups.values()].map(g => {
    const grams = g.reduce((s, b) => s + Math.round(Number(b.net_weight_kg) * 1000), 0);
    const weightKg = grams / 1000;
    return {
      product_name: g[0].product_name,
      boxes: g.length,
      weightKg,
      priceKg: g[0].price_kg,
      amount: lineAmount(weightKg, g[0].price_kg),
    };
  });
  const pence = lines.reduce((s, l) => s + Math.round(l.amount * 100), 0);
  return { lines, total: pence / 100 };
}
