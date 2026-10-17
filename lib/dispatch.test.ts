// Testes da expedição. Rodar: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPick, isComplete, lineAmount, preview, type OrderLine } from "./dispatch.ts";
import type { StockBox } from "./stock.ts";

const today = new Date(2026, 9, 17);
const lines: OrderLine[] = [
  { product_id: "oys", product_name: "Oyster Blade", boxes_requested: 2, price_kg: 14.9 },
  { product_id: "rump", product_name: "PS-D Rump", boxes_requested: 1, price_kg: 12.4 },
];
const box = (o: Partial<StockBox> & { id: string }): StockBox => ({
  product_id: "oys",
  net_weight_kg: "21.770",
  lot: "26057",
  use_by: "2026-12-01",
  status: "in_stock",
  serial: o.id,
  location: null,
  ...o,
});

test("aceita caixa do pedido e avisa quando passa da quantidade", () => {
  const a = box({ id: "a" });
  const b = box({ id: "b" });
  const c = box({ id: "c" });
  assert.deepEqual(checkPick(lines, [], a, today), { ok: true, over: false });
  assert.deepEqual(checkPick(lines, [a], b, today), { ok: true, over: false });
  assert.deepEqual(checkPick(lines, [a, b], c, today), { ok: true, over: true });
});

test("recusa caixa repetida, de outro produto, vendida, bloqueada ou vencida", () => {
  const a = box({ id: "a" });
  const no = (r: ReturnType<typeof checkPick>) => (r.ok ? "ok" : r.reason);
  assert.match(no(checkPick(lines, [a], a, today)), /já está na lista/);
  assert.match(no(checkPick(lines, [], box({ id: "x", product_id: "lamb" }), today)), /não está no pedido/);
  assert.match(no(checkPick(lines, [], box({ id: "y", status: "shipped" }), today)), /já foi vendida/);
  assert.match(no(checkPick(lines, [], box({ id: "z", status: "blocked" }), today)), /bloqueada/);
  assert.match(no(checkPick(lines, [], box({ id: "w", use_by: "2026-10-01" }), today)), /vencida/);
});

test("valor da linha igual ao do banco (peso real × preço, 2 casas)", () => {
  assert.equal(lineAmount(41.87, 14.9), 623.86);
  assert.equal(lineAmount(0.005, 0.1), 0);
  assert.equal(lineAmount(22.3, 12.4), 276.52);
});

test("prévia soma o peso real por produto e lista os lotes", () => {
  const picked = [
    box({ id: "a", net_weight_kg: "21.770", lot: "26057" }),
    box({ id: "b", net_weight_kg: "20.100", lot: "26058" }),
    box({ id: "c", product_id: "rump", net_weight_kg: 22.3, lot: "BG233" }),
  ];
  const p = preview(lines, picked);
  assert.deepEqual(
    p.lines.map(l => [l.boxes, l.weightKg, l.amount, l.lots]),
    [
      [2, 41.87, 623.86, ["26057", "26058"]],
      [1, 22.3, 276.52, ["BG233"]],
    ],
  );
  assert.equal(p.total, 900.38);
  assert.ok(isComplete(p));
  assert.ok(!isComplete(preview(lines, picked.slice(0, 2))));
});
