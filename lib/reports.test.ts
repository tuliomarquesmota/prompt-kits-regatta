// Testes dos relatórios. Rodar: npm test
// Os números vêm do teste feito no banco (migration 009): invoice, devolução, recebimento,
// conta de energia, pagamento e aporte.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  balanceSheet,
  currentPeriod,
  periodRange,
  profitAndLoss,
  shiftPeriod,
  trialBalanceCsv,
  vatBoxes,
  type AccountTotal,
} from "./reports.ts";

const acc = (code: string, name: string, type: AccountTotal["type"], debit: number, credit: number): AccountTotal => ({
  account_id: code,
  code,
  name,
  type,
  system_key: null,
  debit,
  credit,
});

const rows: AccountTotal[] = [
  acc("1100", "Contas a receber", "asset", 565.57, 341.2),
  acc("1200", "Banco", "asset", 1100, 500),
  acc("2100", "Contas a pagar", "liability", 500, 1500),
  acc("2200", "VAT", "liability", 290.2, 40.2),
  acc("3000", "Capital dos sócios", "equity", 0, 1000),
  acc("4000", "Vendas", "income", 201, 525.37),
  acc("5000", "Compra de mercadoria", "expense", 0, 0),
  acc("6200", "Energia", "expense", 1250, 0),
];

test("DRE: receita, custo, lucro bruto e lucro do período", () => {
  const r = profitAndLoss(rows);
  assert.equal(r.revenue, 324.37);
  assert.equal(r.cost, 0);
  assert.equal(r.gross, 324.37);
  assert.equal(r.opex, 1250);
  assert.equal(r.net, -925.63);
  assert.equal(r.margin, 100);
  assert.deepEqual(
    r.expenses.map(l => l.name),
    ["Energia"],
  );
  assert.equal(r.costs.length, 0); // conta zerada não aparece
});

test("balanço fecha: ativo = passivo + patrimônio + resultado", () => {
  const b = balanceSheet(rows);
  assert.equal(b.totalAssets, 824.37); // 224,37 a receber + 600 no banco
  assert.equal(b.totalLiabilities, 750); // 1.000 a pagar − 250 de VAT a recuperar
  assert.equal(b.totalEquity, 74.37); // 1.000 de capital − 925,63 de prejuízo
  assert.ok(b.balanced);
});

test("VAT nas 9 caixas", () => {
  const v = vatBoxes({
    sales_net: 525.37,
    sales_vat: 40.2,
    credits_net: 201,
    credits_vat: 40.2,
    purchases_net: 1250.99,
    purchases_vat: 250,
  });
  assert.deepEqual(v, { box1: 0, box2: 0, box3: 0, box4: 250, box5: -250, box6: 324, box7: 1250, box8: 0, box9: 0 });
});

test("períodos: mês, trimestre e ano", () => {
  assert.deepEqual(periodRange({ kind: "mes", year: 2026, index: 2 }), {
    from: "2026-02-01",
    to: "2026-02-28",
    label: "fev/2026",
  });
  assert.deepEqual(periodRange({ kind: "trimestre", year: 2026, index: 4 }), {
    from: "2026-10-01",
    to: "2026-12-31",
    label: "4º tri/2026 (out–dez)",
  });
  assert.equal(periodRange({ kind: "ano", year: 2026, index: 1 }).to, "2026-12-31");
  assert.deepEqual(shiftPeriod({ kind: "trimestre", year: 2026, index: 1 }, -1), {
    kind: "trimestre",
    year: 2025,
    index: 4,
  });
  assert.deepEqual(shiftPeriod({ kind: "mes", year: 2026, index: 12 }, 1), { kind: "mes", year: 2027, index: 1 });
  assert.deepEqual(currentPeriod("trimestre", new Date(2026, 9, 17)), { kind: "trimestre", year: 2026, index: 4 });
});

test("balancete em CSV só com contas movimentadas", () => {
  const csv = trialBalanceCsv([
    acc("6200", "Energia, gás", "expense", 1250, 0),
    acc("6300", "Veículos", "expense", 0, 0),
  ]);
  assert.equal(csv, 'codigo,conta,tipo,debitos,creditos,saldo\n6200,"Energia, gás",expense,1250.00,0.00,1250.00');
});
