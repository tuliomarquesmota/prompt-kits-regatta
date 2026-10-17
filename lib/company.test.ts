// Testes dos dados da empresa. Rodar: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCompany, invoiceGaps, normalizeSortCode, normalizeVat, type CompanyForm } from "./company.ts";

const form = (o: Partial<CompanyForm> = {}): CompanyForm => ({
  name: "SA Global Meat",
  legal_name: "SA Global Meat Ltd",
  company_number: "12345678",
  vat_number: "gb 123 4567 89",
  address: "Unit 4\nLondon E1 1AA",
  email: "accounts@saglobal.co.uk",
  phone: "",
  bank_name: "Barclays",
  bank_account_name: "SA Global Meat Ltd",
  sort_code: "20 00 00",
  account_number: "12345678",
  invoice_notes: "",
  ...o,
});

test("normaliza número de VAT e sort code", () => {
  assert.equal(normalizeVat("gb 123 4567 89"), "GB123456789");
  assert.equal(normalizeVat("123456789"), "GB123456789");
  assert.equal(normalizeVat("GB123456789012"), "GB123456789012");
  assert.equal(normalizeVat(""), null);
  assert.equal(normalizeVat("GB12345"), "");
  assert.equal(normalizeSortCode("200000"), "20-00-00");
  assert.equal(normalizeSortCode("20-00-00"), "20-00-00");
  assert.equal(normalizeSortCode("2000"), "");
  assert.equal(normalizeSortCode(" "), null);
});

test("monta os dados com campos vazios como null", () => {
  const r = checkCompany(form());
  assert.ok(r.ok);
  assert.equal(r.row.vat_number, "GB123456789");
  assert.equal(r.row.sort_code, "20-00-00");
  assert.equal(r.row.phone, null);
  assert.equal(r.row.invoice_notes, null);
});

test("recusa dados inválidos com mensagem clara", () => {
  const err = (f: CompanyForm) => {
    const r = checkCompany(f);
    return r.ok ? "ok" : r.error;
  };
  assert.match(err(form({ name: " " })), /nome/);
  assert.match(err(form({ vat_number: "GB12" })), /VAT inválido/);
  assert.match(err(form({ sort_code: "1234" })), /Sort code/);
  assert.match(err(form({ account_number: "123" })), /8 dígitos/);
  assert.match(err(form({ company_number: "123" })), /Companies House/);
  assert.match(err(form({ email: "x@" })), /Email/);
});

test("aponta o que falta para a VAT invoice", () => {
  const ok = checkCompany(form());
  assert.ok(ok.ok);
  assert.deepEqual(invoiceGaps(ok.row, "1 High St", true), []);
  assert.deepEqual(invoiceGaps({ ...ok.row, vat_number: null }, "1 High St", false), []);
  assert.deepEqual(invoiceGaps(null, null, true), [
    "endereço da empresa",
    "número de VAT da empresa",
    "endereço do cliente",
  ]);
});
