// Testes do documento da invoice em inglês. Rodar: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { gbp, invoiceText, invoiceTotals, kgEn, ukDate } from "./invoice-doc.ts";
import type { InvoiceDetail } from "./sales.ts";

const inv: InvoiceDetail = {
  id: "i1",
  number: "INV-0001",
  issued_on: "2026-10-17",
  due_on: "2026-11-16",
  total: 525.37,
  vat_total: 40.2,
  status: "draft",
  customer: { name: "The Butcher's Block", email: null, address: "1 High St" },
  order: "SO-0001",
  lines: [
    {
      product: "Inside (topside)",
      boxes: 1,
      weight_kg: 21.77,
      price_kg: 14.9,
      amount: 324.37,
      lots: [],
      vat_rate: 0,
      vat_amount: 0,
    },
    {
      product: "Oyster Blade",
      boxes: 2,
      weight_kg: 20.1,
      price_kg: 10,
      amount: 201,
      lots: [],
      vat_rate: 20,
      vat_amount: 40.2,
    },
  ],
  credits: [
    {
      id: "c",
      number: "CN-0001",
      issued_on: "2026-10-18",
      reason: null,
      restocked: true,
      total: 201,
      vat_total: 40.2,
      lines: [],
    },
  ],
  payments: [{ id: "p", amount: 100, paid_on: "2026-10-19", method: "transferencia", note: null }],
};

test("formato do Reino Unido", () => {
  assert.equal(gbp(1234.5), "£1,234.50");
  assert.equal(kgEn(21.77), "21.77 kg");
  assert.equal(ukDate("2026-10-17"), "17/10/2026");
});

test("totais com credit note e pagamento", () => {
  assert.deepEqual(invoiceTotals(inv), { gross: 565.57, credited: 241.2, paid: 100, balance: 224.37 });
});

test("texto em inglês para o cliente", () => {
  const txt = invoiceText(
    inv,
    {
      name: "SA Global",
      legal_name: "SA Global Meat Ltd",
      company_number: null,
      vat_number: "GB123456789",
      address: null,
      email: null,
      phone: null,
      bank_name: "Barclays",
      bank_account_name: null,
      sort_code: "20-00-00",
      account_number: "12345678",
      invoice_notes: null,
    },
    "SA Global",
  );
  assert.match(txt, /^SA Global Meat Ltd · VAT invoice INV-0001/);
  assert.match(txt, /To: The Butcher's Block/);
  assert.match(txt, /Date: 17\/10\/2026 · Due: 16\/11\/2026/);
  assert.match(txt, /Oyster Blade: 2 boxes, 20.10 kg × £10.00\/kg = £201.00/);
  assert.match(txt, /Inside \(topside\): 1 box,/);
  assert.match(txt, /Balance due: £224.37/);
  assert.match(txt, /Sort code 20-00-00 · Account 12345678 · Reference INV-0001/);
  assert.doesNotMatch(txt, /Cliente|Saldo|Pagamento/);
});
