// Testes de contas a pagar. Rodar: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkBill, vatOf, type BillForm } from "./payables.ts";

const form = (o: Partial<BillForm> = {}): BillForm => ({
  supplier_id: "",
  payee: "British Gas",
  account_id: "energia",
  description: "",
  reference: "",
  issued_on: "2026-10-01",
  due_on: "2026-10-31",
  net: "1.250,00",
  vat_rate: "20",
  vat_amount: "",
  ...o,
});

test("VAT calculado pela taxa, em pence", () => {
  assert.equal(vatOf(1250, 20), 250);
  assert.equal(vatOf(0.05, 20), 0.01);
  assert.equal(vatOf(99.99, 5), 5);
  assert.equal(vatOf(100, 0), 0);
});

test("monta a conta com VAT calculado ou digitado", () => {
  const r = checkBill(form());
  assert.ok(r.ok);
  assert.equal(r.gross, 1500);
  assert.deepEqual(r.row, {
    supplier_id: null,
    payee: "British Gas",
    account_id: "energia",
    description: null,
    reference: null,
    issued_on: "2026-10-01",
    due_on: "2026-10-31",
    net: 1250,
    vat_rate: 20,
    vat_amount: 250,
  });
  const digitado = checkBill(form({ vat_amount: "249,99" }));
  assert.ok(digitado.ok && digitado.row.vat_amount === 249.99 && digitado.gross === 1499.99);
  const fornecedor = checkBill(form({ supplier_id: "teys", payee: "ignorado" }));
  assert.ok(fornecedor.ok && fornecedor.row.payee === null && fornecedor.row.supplier_id === "teys");
});

test("recusa conta sem quem recebe, categoria, valor ou com datas trocadas", () => {
  const err = (f: BillForm) => {
    const r = checkBill(f);
    return r.ok ? "ok" : r.error;
  };
  assert.match(err(form({ payee: " " })), /fornecedor/);
  assert.match(err(form({ account_id: "" })), /categoria/);
  assert.match(err(form({ net: "" })), /Valor sem VAT/);
  assert.match(err(form({ due_on: "2026-09-01" })), /vencimento/);
  assert.match(err(form({ vat_amount: "2000" })), /VAT está maior/);
});
