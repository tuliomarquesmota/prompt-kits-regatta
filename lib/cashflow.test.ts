// Testes do fluxo de caixa e da cobrança. Rodar: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { cashForecast, chaseMessage } from "./cashflow.ts";

// Sábado, 17/10/2026: a semana começa na segunda 12/10
const today = new Date(2026, 9, 17);

test("semanas de segunda a domingo, com atrasados à parte", () => {
  const f = cashForecast(
    1000,
    [
      { due_on: "2026-10-10", balance: 300 }, // atrasado
      { due_on: "2026-10-18", balance: 200 }, // esta semana (domingo)
      { due_on: "2026-10-21", balance: 0.1 },
      { due_on: "2026-10-22", balance: 0.2 },
      { due_on: "2027-01-30", balance: 999 }, // depois das 8 semanas
    ],
    [
      { due_on: "2026-10-16", balance: 50 }, // atrasado
      { due_on: "2026-10-26", balance: 2000 },
    ],
    8,
    today,
  );
  assert.equal(f.rows[0].label, "Atrasado");
  assert.deepEqual([f.rows[0].inflow, f.rows[0].outflow, f.rows[0].balance], [300, 50, 1250]);
  assert.equal(f.rows[1].label, "12/10 – 18/10");
  assert.equal(f.rows[1].balance, 1450);
  assert.equal(f.rows[2].inflow, 0.3); // soma em pence
  assert.equal(f.rows[3].outflow, 2000);
  assert.equal(f.rows[3].balance, -549.7);
  assert.equal(f.firstNegative?.label, "26/10 – 01/11");
  assert.equal(f.lowest, -549.7);
  assert.deepEqual(f.later, { inflow: 999, outflow: 0 });
  assert.equal(f.rows.length, 9);
});

test("sem atrasados não mostra a linha Atrasado", () => {
  const f = cashForecast(10, [], [], 2, today);
  assert.deepEqual(
    f.rows.map(r => r.label),
    ["12/10 – 18/10", "19/10 – 25/10"],
  );
  assert.equal(f.firstNegative, null);
});

test("mensagem de cobrança em inglês, tom sobe com o atraso", () => {
  const bank = { name: "Barclays", sort_code: "20-00-00", account_number: "12345678" };
  const gentle = chaseMessage(
    "Açougue A",
    [{ number: "INV-0003", due_on: "2026-10-10", balance: 120.5, late: 7 }],
    "SA Global Meat Ltd",
    bank,
  );
  assert.equal(gentle.tone, "gentle");
  assert.match(gentle.text, /friendly reminder that the following invoice is now due/);
  assert.match(gentle.text, /INV-0003 – £120.50 \(due 10\/10\/2026\)/);
  assert.match(gentle.text, /Sort code 20-00-00/);
  assert.match(gentle.text, /SA Global Meat Ltd$/);

  const final = chaseMessage(
    "Loja B",
    [
      { number: "INV-0001", due_on: "2026-08-01", balance: 1000, late: 77 },
      { number: "INV-0009", due_on: "2026-11-01", balance: 50, late: 0 },
    ],
    "SA",
    null,
  );
  assert.equal(final.tone, "final");
  assert.match(final.text, /invoice remains unpaid/);
  assert.match(final.text, /Total outstanding: £1,000.00/); // só as vencidas
  assert.doesNotMatch(final.text, /INV-0009|Sort code/);
  assert.equal(chaseMessage("C", [{ number: "X", due_on: null, balance: 1, late: 20 }], "S", null).tone, "firm");
});
