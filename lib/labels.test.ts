// Testes com os códigos lidos das etiquetas reais. Rodar: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readLabel, serialFromSecondCode, type LabelProfile } from "./labels.ts";

const profiles: LabelProfile[] = [
  {
    id: "teys",
    supplier_id: "s1",
    supplier_name: "Teys Australia",
    match: { tipo: "gs1", prefixo_gtin: "9332218" },
    rules: { shelf_dias: 140, lote: { regra: "aaddd" }, peso_kg: [10, 35] },
  },
  {
    id: "sff",
    supplier_id: "s2",
    supplier_name: "Silver Fern Farms",
    match: { tipo: "gs1", prefixo_gtin: "9418220" },
    rules: { shelf_dias: 120, lote: { regra: "ddd", prefixo: "BG" }, peso_kg: [10, 35] },
  },
  {
    id: "liffey",
    supplier_id: "s3",
    supplier_name: "Liffey Meats",
    match: {
      tipo: "molde",
      chave: "liffey",
      padrao: "^\\d{10}$",
      produto: [0, 4],
      peso: [4, 8],
      casas: 2,
      serial_itf: true,
    },
    rules: { peso_kg: [5, 35] },
  },
];

test("Teys · Oyster Blade (formato com parênteses)", () => {
  const r = readLabel(["(01)99332218350849(3102)002177(13)260226(21)050018580273"], profiles)!;
  assert.equal(r.supplierName, "Teys Australia");
  assert.equal(r.netWeightKg, 21.77);
  assert.equal(r.lot, "26057");
  assert.equal(r.useBy, "2026-07-16");
  assert.equal(r.serial, "050018580273");
  assert.deepEqual(r.missing, []);
});

test("Teys · Inside (formato cru do leitor, ]C1)", () => {
  const r = readLabel(["]C10199332218350528310200170213250811210500018302" + "73"], profiles)!;
  assert.equal(r.netWeightKg, 17.02);
  assert.equal(r.lot, "25223");
  assert.equal(r.useBy, "2025-12-29");
});

test("Silver Fern · PS-D Rump (data de produção 11)", () => {
  const r = readLabel(["(01)99418220391152(3102)002230(11)250821(21)445233010673"], profiles)!;
  assert.equal(r.supplierName, "Silver Fern Farms");
  assert.equal(r.netWeightKg, 22.3);
  assert.equal(r.lot, "BG233");
  assert.equal(r.useBy, "2025-12-19");
});

test("Liffey · molde com peso no código e serial no 2º código", () => {
  const r = readLabel(["5300239200", "9415214149"], profiles)!;
  assert.equal(r.productKey, "liffey:5300");
  assert.equal(r.netWeightKg, 23.92);
  assert.equal(r.serial, "41521414");
  assert.deepEqual(r.missing, ["validade"]);
});

test("Liffey · serial chega depois, num segundo scan", () => {
  const r = readLabel(["5300239200"], profiles)!;
  assert.deepEqual(r.missing, ["validade", "serial"]);
  assert.equal(serialFromSecondCode("9415214149", r), "41521414");
});

test("Separador FNC1 com lote variável no meio", () => {
  const r = readLabel(["0197891234500017310301845017270310" + "10L26283\u001d" + "2188123401"], profiles)!;
  assert.equal(r.netWeightKg, 18.45);
  assert.equal(r.lot, "L26283");
  assert.equal(r.useBy, "2027-03-10");
  assert.equal(r.serial, "88123401");
  assert.ok(r.warnings.length > 0); // fornecedor sem perfil
});

test("Peso absurdo gera alerta", () => {
  const r = readLabel(["(01)99332218350849(3101)002177(13)260226(21)1"], profiles)!;
  assert.equal(r.netWeightKg, 217.7);
  assert.ok(r.warnings.some(w => w.includes("fora da faixa")));
});

test("Código desconhecido não é aceito", () => {
  assert.equal(readLabel(["ABC123"], profiles), null);
});
