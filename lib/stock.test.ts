// Testes da lógica de stock. Rodar: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { fefo, matches, summarize, type StockBox, type StockProduct } from "./stock.ts";

const today = new Date(2026, 9, 17); // 17/10/2026

const products: StockProduct[] = [
  { id: "pic", name: "Picanha", supplier: "JBS" },
  { id: "oys", name: "Oyster Blade", supplier: "Teys Australia" },
  { id: "lam", name: "Lamb Rack", supplier: "Alliance" },
];

const box = (o: Partial<StockBox> & { id: string }): StockBox => ({
  product_id: "pic",
  net_weight_kg: "20.000",
  lot: "L1",
  use_by: "2026-12-01",
  status: "in_stock",
  serial: o.id,
  location: "Câmara 1",
  ...o,
});

const boxes: StockBox[] = [
  box({ id: "a", use_by: "2026-11-30", net_weight_kg: "21.450" }),
  box({ id: "b", use_by: "2026-10-24", net_weight_kg: "19.800", lot: "L26271" }), // vence em 7 dias
  box({ id: "c", use_by: "2026-10-10" }), // vencida, ainda marcada em stock
  box({ id: "d", status: "blocked", use_by: "2026-12-20" }),
  box({ id: "e", status: "shipped" }), // já saiu: não conta
  box({ id: "f", use_by: null, net_weight_kg: 18 }),
  box({ id: "g", product_id: "oys", use_by: "2026-11-05", net_weight_kg: "17.020" }),
];

test("resumo conta só caixas vendáveis e soma o peso real", () => {
  const s = summarize(products, boxes, today);
  const pic = s.find(p => p.id === "pic")!;
  assert.equal(pic.available, 3); // a, b, f
  assert.equal(pic.availableKg, 59.25); // 21,45 + 19,8 + 18
  assert.equal(pic.nextUseBy, "2026-10-24");
  assert.equal(pic.expiringSoon, 1);
  assert.equal(pic.blocked, 2); // c vencida + d bloqueada
});

test("produtos com stock aparecem antes dos vazios", () => {
  const s = summarize(products, boxes, today);
  assert.deepEqual(
    s.map(p => p.id),
    ["oys", "pic", "lam"],
  );
  assert.equal(s[2].available, 0);
});

test("FEFO: vence primeiro, sai primeiro; vencidas e bloqueadas no fim", () => {
  const order = fefo(
    boxes.filter(b => b.product_id === "pic"),
    today,
  );
  assert.deepEqual(
    order.map(b => b.id),
    ["b", "a", "f", "c", "d"],
  );
  assert.deepEqual(
    order.map(b => b.state),
    ["vence-logo", "ok", "ok", "vencida", "bloqueada"],
  );
});

test("a primeira caixa boa é marcada para sair primeiro", () => {
  const order = fefo([box({ id: "x", use_by: "2026-12-01" }), box({ id: "y", use_by: "2027-01-15" })], today);
  assert.equal(order[0].id, "x");
  assert.equal(order[0].state, "sai-primeiro");
  assert.equal(order[1].state, "ok");
});

test("busca por nome, fornecedor, lote e número da caixa", () => {
  assert.ok(matches(products[0], boxes, "pica"));
  assert.ok(matches(products[1], boxes, "teys"));
  assert.ok(matches(products[0], boxes, "l26271"));
  assert.ok(matches(products[1], boxes, "g"));
  assert.ok(!matches(products[2], boxes, "teys"));
});
