// Testes de contas a receber. Rodar: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { bucket, byCustomer, daysLate, sumMoney } from "./receivables.ts";

const today = new Date(2026, 9, 17);

test("dias de atraso contam a partir do vencimento", () => {
  assert.equal(daysLate("2026-10-17", today), 0);
  assert.equal(daysLate("2026-11-01", today), 0);
  assert.equal(daysLate("2026-10-16", today), 1);
  assert.equal(daysLate("2026-08-18", today), 60);
  assert.equal(daysLate(null, today), 0);
});

test("faixas de atraso", () => {
  assert.equal(bucket(0), "em-dia");
  assert.equal(bucket(1), "1-30");
  assert.equal(bucket(30), "1-30");
  assert.equal(bucket(31), "31-60");
  assert.equal(bucket(61), "60+");
});

test("agrupa por cliente, mais atrasado primeiro, soma sem erro de centavo", () => {
  const list = [
    { id: "1", customer_id: "a", customer: "Açougue A", due_on: "2026-11-01", balance: 0.1 },
    { id: "2", customer_id: "a", customer: "Açougue A", due_on: "2026-10-01", balance: 0.2 },
    { id: "3", customer_id: "b", customer: "Loja B", due_on: "2026-07-01", balance: 50 },
  ];
  const r = byCustomer(list, today);
  assert.deepEqual(
    r.map(c => [c.customer, c.total, c.overdue, c.maxLate]),
    [
      ["Loja B", 50, 50, 108],
      ["Açougue A", 0.3, 0.2, 16],
    ],
  );
  assert.deepEqual(
    r[1].invoices.map(i => i.id),
    ["2", "1"],
  );
  assert.equal(sumMoney([0.1, 0.2]), 0.3);
});
