// Relatórios contábeis: DRE, balanço, VAT e períodos. Lógica pura, para testar.
// Todas as somas em pence, para não errar centavo.

export type AccountTotal = {
  account_id: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense";
  system_key: string | null;
  debit: number;
  credit: number;
};

export type ReportLine = { code: string; name: string; amount: number };
const p = (n: number) => Math.round(Number(n) * 100);
const pounds = (pence: number) => pence / 100;

/** Saldo no sentido natural da conta: ativo e despesa pelo débito; o resto pelo crédito. */
export function natural(a: AccountTotal): number {
  const d = p(a.debit) - p(a.credit);
  return pounds(a.type === "asset" || a.type === "expense" ? d : -d);
}

const lines = (rows: AccountTotal[]): ReportLine[] =>
  rows.map(a => ({ code: a.code, name: a.name, amount: natural(a) })).filter(l => l.amount !== 0);
const total = (ls: ReportLine[]) => pounds(ls.reduce((s, l) => s + p(l.amount), 0));

/** DRE: receitas − custos (contas 5xxx) = lucro bruto; − despesas (6xxx em diante) = lucro do período. */
export function profitAndLoss(rows: AccountTotal[]) {
  const income = lines(rows.filter(a => a.type === "income"));
  const costs = lines(rows.filter(a => a.type === "expense" && a.code.startsWith("5")));
  const expenses = lines(rows.filter(a => a.type === "expense" && !a.code.startsWith("5")));
  const revenue = total(income);
  const cost = total(costs);
  const opex = total(expenses);
  const gross = pounds(p(revenue) - p(cost));
  const net = pounds(p(gross) - p(opex));
  const margin = revenue ? Math.round((gross / revenue) * 1000) / 10 : null;
  return { income, costs, expenses, revenue, cost, gross, opex, net, margin };
}

/** Balanço até uma data: ativo = passivo + patrimônio + resultado ainda não fechado. */
export function balanceSheet(rows: AccountTotal[]) {
  const assets = lines(rows.filter(a => a.type === "asset"));
  const liabilities = lines(rows.filter(a => a.type === "liability"));
  const equity = lines(rows.filter(a => a.type === "equity"));
  const result = profitAndLoss(rows).net;
  const totalAssets = total(assets);
  const totalLiabilities = total(liabilities);
  const totalEquity = pounds(p(total(equity)) + p(result));
  return {
    assets,
    liabilities,
    equity,
    result,
    totalAssets,
    totalLiabilities,
    totalEquity,
    balanced: p(totalAssets) === p(totalLiabilities) + p(totalEquity),
  };
}

export type VatSums = {
  sales_net: number;
  sales_vat: number;
  credits_net: number;
  credits_vat: number;
  purchases_net: number;
  purchases_vat: number;
};

/** As 9 caixas da declaração de VAT. Caixas 6 a 9 em libras inteiras, sem os pence (regra da HMRC). */
export function vatBoxes(s: VatSums) {
  const box1 = pounds(p(s.sales_vat) - p(s.credits_vat));
  const box2 = 0; // compras da UE: só para Irlanda do Norte
  const box3 = pounds(p(box1) + p(box2));
  const box4 = pounds(p(s.purchases_vat));
  const box5 = pounds(p(box3) - p(box4));
  const whole = (n: number) => Math.trunc(n);
  return {
    box1,
    box2,
    box3,
    box4,
    box5,
    box6: whole(pounds(p(s.sales_net) - p(s.credits_net))),
    box7: whole(Number(s.purchases_net)),
    box8: 0,
    box9: 0,
  };
}

export type Period = { kind: "mes" | "trimestre" | "ano"; year: number; index: number }; // index: mês 1-12 ou trimestre 1-4

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function periodRange(per: Period): { from: string; to: string; label: string } {
  if (per.kind === "ano") return { from: iso(per.year, 1, 1), to: iso(per.year, 12, 31), label: String(per.year) };
  if (per.kind === "trimestre") {
    const m1 = (per.index - 1) * 3 + 1;
    return {
      from: iso(per.year, m1, 1),
      to: iso(per.year, m1 + 2, lastDay(per.year, m1 + 2)),
      label: `${per.index}º tri/${per.year} (${MONTHS[m1 - 1]}–${MONTHS[m1 + 1]})`,
    };
  }
  return {
    from: iso(per.year, per.index, 1),
    to: iso(per.year, per.index, lastDay(per.year, per.index)),
    label: `${MONTHS[per.index - 1]}/${per.year}`,
  };
}

export function shiftPeriod(per: Period, delta: number): Period {
  if (per.kind === "ano") return { ...per, year: per.year + delta };
  const size = per.kind === "trimestre" ? 4 : 12;
  const n = per.year * size + (per.index - 1) + delta;
  return { ...per, year: Math.floor(n / size), index: (n % size) + 1 };
}

export function currentPeriod(kind: Period["kind"], today = new Date()): Period {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  if (kind === "ano") return { kind, year: y, index: 1 };
  if (kind === "trimestre") return { kind, year: y, index: Math.ceil(m / 3) };
  return { kind, year: y, index: m };
}

/** Balancete em CSV (para o contador): código, conta, tipo, débitos, créditos, saldo. */
export function trialBalanceCsv(rows: AccountTotal[]): string {
  const esc = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = "codigo,conta,tipo,debitos,creditos,saldo";
  const body = rows
    .filter(a => p(a.debit) !== 0 || p(a.credit) !== 0)
    .map(a =>
      [
        a.code,
        esc(a.name),
        a.type,
        Number(a.debit).toFixed(2),
        Number(a.credit).toFixed(2),
        natural(a).toFixed(2),
      ].join(","),
    );
  return [head, ...body].join("\n");
}
