// Testes da devolução. Rodar: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { creditPreview, type ShippedBox } from "./returns.ts";

const box = (o: Partial<ShippedBox> & { id: string }): ShippedBox => ({
  product_id: "oys",
  product_name: "Oyster Blade",
  net_weight_kg: 21.77,
  price_kg: 14.9,
  lot: "L1",
  serial: o.id,
  returned: false,
  ...o,
});

test("credit note pelo peso real, igual ao banco", () => {
  // Mesmo caso testado no banco: 21,770 kg × £14,90 = £324,37
  assert.deepEqual(creditPreview([box({ id: "a" })]), {
    lines: [{ product_name: "Oyster Blade", boxes: 1, weightKg: 21.77, priceKg: 14.9, amount: 324.37 }],
    total: 324.37,
  });
});

test("agrupa por produto e soma o total", () => {
  const p = creditPreview([
    box({ id: "a" }),
    box({ id: "b", net_weight_kg: 20.1 }),
    box({ id: "c", product_id: "rump", product_name: "PS-D Rump", net_weight_kg: 22.3, price_kg: 12.4 }),
  ]);
  assert.deepEqual(
    p.lines.map(l => [l.product_name, l.boxes, l.weightKg, l.amount]),
    [
      ["Oyster Blade", 2, 41.87, 623.86],
      ["PS-D Rump", 1, 22.3, 276.52],
    ],
  );
  assert.equal(p.total, 900.38);
  assert.deepEqual(creditPreview([]), { lines: [], total: 0 });
});
