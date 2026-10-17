// Testes de custo por caixa e margem. Rodar: npm test
// Mesmos números do teste feito no banco (migration 013).
import { test } from "node:test";
import assert from "node:assert/strict";
import { landedCosts, marginBy, type MarginRow } from "./costing.ts";

const rows = [
  { product_id: "top", product: "Inside (topside)", boxes: 1, weight_kg: 21.77 },
  { product_id: "oys", product: "Oyster Blade", boxes: 1, weight_kg: 20.1 },
];

test("custo por kg = preço do fornecedor + extras rateados por kg", () => {
  const r = landedCosts(rows, { top: 9.8, oys: 8 }, 41.87);
  assert.equal(r.totalKg, 41.87);
  assert.equal(r.extraKg, 1);
  assert.deepEqual(
    r.lines.map(l => [l.cost_kg, l.cost]),
    [
      [10.8, 235.12],
      [9, 180.9],
    ],
  );
  assert.equal(r.total, 416.02);
  assert.equal(r.missing, 0);
});

test("produto sem preço fica sem custo e é contado", () => {
  const r = landedCosts(rows, { top: 9.8 }, 0);
  assert.equal(r.lines[1].cost, null);
  assert.equal(r.missing, 1);
  assert.equal(r.total, 213.35);
  assert.equal(landedCosts([], {}, 100).extraKg, 0);
});

const m = (o: Partial<MarginRow>): MarginRow => ({
  invoice_id: "i1",
  customer_id: "c1",
  customer: "Açougue A",
  product_id: "top",
  product: "Inside (topside)",
  boxes: 1,
  weight_kg: 21.77,
  revenue: 324.37,
  cost: 235.12,
  boxes_without_cost: 0,
  ...o,
});

test("margem por produto e por cliente", () => {
  const list = [
    m({}),
    m({ product_id: "oys", product: "Oyster Blade", weight_kg: 20.1, revenue: 201, cost: 180.9 }),
    m({ customer_id: "c2", customer: "Loja B", revenue: 100, cost: null, boxes_without_cost: 1 }),
  ];
  const p = marginBy(list, "product");
  assert.deepEqual(
    p.groups.map(g => [g.name, g.revenue, g.cost, g.margin, g.pct, g.withoutCost]),
    [
      ["Inside (topside)", 324.37, 235.12, 89.25, 27.5, 1],
      ["Oyster Blade", 201, 180.9, 20.1, 10, 0],
    ],
  );
  assert.equal(p.total.margin, 109.35);
  assert.equal(p.total.withoutCost, 1);
  const c = marginBy(list, "customer");
  assert.deepEqual(
    c.groups.map(g => g.name),
    ["Açougue A", "Loja B"],
  );
});
