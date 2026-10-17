// Testes do cadastro de produtos. Rodar: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkProduct, newProductHref, numberText, parseNumber, weightWarning, type ProductForm } from "./products.ts";

const form = (o: Partial<ProductForm> = {}): ProductForm => ({
  name: "Oyster Blade",
  supplier_id: "teys",
  gtin: "99332218350849",
  sku: "",
  price: "14,90",
  minKg: "15",
  maxKg: "30",
  vat: "0",
  ...o,
});

test("lê número com vírgula ou ponto", () => {
  assert.equal(parseNumber("14,90"), 14.9);
  assert.equal(parseNumber("14.9"), 14.9);
  assert.equal(parseNumber("1.234,56"), 1234.56);
  assert.equal(parseNumber(" 22 "), 22);
  assert.equal(parseNumber(""), null);
  assert.ok(Number.isNaN(parseNumber("abc")));
  assert.ok(Number.isNaN(parseNumber("-3")));
});

test("monta a linha do banco com campos vazios como null", () => {
  const r = checkProduct(form({ sku: "  ", gtin: " 99332218350849 ", supplier_id: "" }));
  assert.ok(r.ok);
  assert.deepEqual(r.row, {
    name: "Oyster Blade",
    supplier_id: null,
    gtin: "99332218350849",
    sku: null,
    default_price_kg: 14.9,
    min_box_kg: 15,
    max_box_kg: 30,
    vat_rate: 0,
  });
  const vazio = checkProduct(form({ price: "", minKg: "", maxKg: "" }));
  assert.ok(vazio.ok && vazio.row.default_price_kg === null && vazio.row.min_box_kg === null);
});

test("recusa nome vazio, número inválido e faixa de peso invertida", () => {
  const err = (f: ProductForm) => {
    const r = checkProduct(f);
    return r.ok ? "ok" : r.error;
  };
  assert.match(err(form({ name: " " })), /nome/);
  assert.match(err(form({ price: "14,9x" })), /Preço/);
  assert.match(err(form({ minKg: "dez" })), /Peso inválido/);
  assert.match(err(form({ minKg: "30", maxKg: "15" })), /mínimo está maior/);
  assert.match(err(form({ maxKg: "150" })), /99 kg/);
  assert.match(err(form({ vat: "17.5" })), /VAT/);
});

test("link de cadastro a partir da caixa lida", () => {
  assert.equal(newProductHref("liffey:5300", "abc"), "/cadastros?produto=novo&codigo=liffey%3A5300&fornecedor=abc");
  assert.equal(newProductHref("99332218350849", null), "/cadastros?produto=novo&codigo=99332218350849");
  assert.equal(numberText("14.90"), "14,9");
  assert.equal(numberText(null), "");
});

test("avisa quando o peso lido foge da faixa do produto", () => {
  assert.equal(weightWarning(21.77, 15, 30), null);
  assert.equal(weightWarning(21.77, null, undefined), null);
  assert.equal(weightWarning(null, 15, 30), null);
  assert.match(weightWarning(2.177, "15.000", "30.000") ?? "", /abaixo .*mínimo 15 kg/);
  assert.match(weightWarning(217.7, 15, 30) ?? "", /acima .*máximo 30 kg/);
});
