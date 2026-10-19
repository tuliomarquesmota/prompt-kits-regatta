// Testes do histórico de alterações. Rodar: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { changeLines, describe, fieldValue, type AuditRow } from "./audit.ts";

const row = (r: Partial<AuditRow>): AuditRow => ({
  id: 1,
  table_name: "products",
  row_id: "x",
  label: "Picanha",
  action: "update",
  changed_at: "2026-10-19T09:42:00Z",
  changes: {},
  note: null,
  who: "Túlio",
  ...r,
});

test("valores em formato legível", () => {
  assert.match(fieldValue("default_price_kg", 15.5), /^£\s?15,50$/);
  assert.equal(fieldValue("use_by", "2026-11-03"), "03/11/2026");
  assert.equal(fieldValue("status", "paid"), "paga");
  assert.equal(fieldValue("net_weight_kg", 21.77), "21,77 kg");
  assert.equal(fieldValue("vat_rate", 20), "20%");
  assert.equal(fieldValue("lot", null), "vazio");
});

test("alteração mostra antes → depois e esconde ids", () => {
  const r = row({
    changes: {
      default_price_kg: [14.9, 15.5],
      supplier_id: ["2b7c1d1e-1111-4222-8333-444455556666", "3b7c1d1e-1111-4222-8333-444455556666"],
      org_id: ["a", "b"],
    },
  });
  assert.equal(describe(r), "Túlio alterou produto Picanha");
  const lines = changeLines(r);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^Preço por kg: £\s?14,90 → £\s?15,50$/);
  assert.equal(lines[1], "Fornecedor: alterado");
});

test("criação mostra só campos conhecidos", () => {
  const r = row({
    table_name: "payments",
    action: "insert",
    label: "INV-0003",
    who: "adriano@exemplo.com",
    changes: { amount: 100, paid_on: "2026-10-19", invoice_id: "2b7c1d1e-1111-4222-8333-444455556666", foo: 1 },
  });
  assert.equal(describe(r), "adriano criou recebimento INV-0003");
  assert.equal(changeLines(r).length, 2);
});

test("fechar e reabrir o mês têm frase própria", () => {
  const close = row({ table_name: "organizations", changes: { books_locked_until: [null, "2026-09-30"] } });
  assert.equal(describe(close), "Túlio fechou o livro até 30/09/2026");
  const open = row({ table_name: "organizations", changes: { books_locked_until: ["2026-09-30", null] } });
  assert.equal(describe(open), "Túlio reabriu todos os meses");
  const member = row({ table_name: "memberships", action: "insert", label: "adriano@x.com" });
  assert.equal(describe(member), "Túlio adicionou à equipe adriano@x.com");
});
