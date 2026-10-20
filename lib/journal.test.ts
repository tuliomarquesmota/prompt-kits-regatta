// Testes do livro contábil. Rodar: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEntry, isLocked, monthLabel, monthRange, nextToClose, reopenTarget, shiftMonth } from "./journal.ts";

test("lançamento manual equilibrado passa, com soma em pence", () => {
  const r = checkEntry("Aporte dos sócios", [
    { account_id: "banco", debit: "1.000,10", credit: "" },
    { account_id: "capital", debit: "", credit: "1000,1" },
    { account_id: "", debit: "", credit: "" },
  ]);
  assert.ok(r.ok);
  assert.equal(r.total, 1000.1);
  assert.deepEqual(r.lines, [
    { account_id: "banco", debit: 1000.1, credit: 0 },
    { account_id: "capital", debit: 0, credit: 1000.1 },
  ]);
  const centavos = checkEntry("x", [
    { account_id: "a", debit: "0,1", credit: "" },
    { account_id: "b", debit: "0,2", credit: "" },
    { account_id: "c", debit: "", credit: "0,3" },
  ]);
  assert.ok(centavos.ok);
});

test("recusa lançamento sem descrição, desequilibrado ou com linha nos dois lados", () => {
  const err = (d: string, l: Parameters<typeof checkEntry>[1]) => {
    const r = checkEntry(d, l);
    return r.ok ? "ok" : r.error;
  };
  const ok2 = [
    { account_id: "a", debit: "10", credit: "" },
    { account_id: "b", debit: "", credit: "10" },
  ];
  assert.match(err(" ", ok2), /descrição/);
  assert.match(err("x", ok2.slice(0, 1)), /duas linhas/);
  assert.match(err("x", [ok2[0], { account_id: "b", debit: "", credit: "9" }]), /precisam ser iguais/);
  assert.match(err("x", [ok2[0], { account_id: "b", debit: "1", credit: "1" }]), /só o débito/);
  assert.match(err("x", [ok2[0], { account_id: "", debit: "", credit: "10" }]), /escolha a conta/);
});

test("períodos por mês", () => {
  assert.deepEqual(monthRange("2026-02"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(monthRange("2028-02"), { from: "2028-02-01", to: "2028-02-29" });
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(monthLabel("2026-10"), "out/2026");
});

test("fechamento do mês: o que está travado e o próximo a fechar", () => {
  assert.equal(isLocked("2026-09-30", "2026-09-30"), true);
  assert.equal(isLocked("2026-10-01", "2026-09-30"), false);
  assert.equal(isLocked("2026-01-01", null), false);
  // nada fechado: sugere o mês passado
  assert.equal(nextToClose(null, "2026-10-19"), "2026-09");
  // setembro fechado: outubro ainda não terminou
  assert.equal(nextToClose("2026-09-30", "2026-10-19"), null);
  assert.equal(nextToClose("2026-08-31", "2026-10-19"), "2026-09");
  assert.equal(nextToClose("2025-12-31", "2026-01-02"), null);
  assert.equal(nextToClose("2025-11-30", "2026-01-02"), "2025-12");
  // reabrir o último mês: volta para o fim do anterior
  assert.equal(reopenTarget("2026-09-30"), "2026-08-31");
  assert.equal(reopenTarget("2026-03-31"), "2026-02-28");
});
