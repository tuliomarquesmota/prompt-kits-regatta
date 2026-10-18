// Fluxo de caixa previsto e mensagem de cobrança. Lógica pura, para testar.
import { gbp, ukDate } from "./invoice-doc.ts";

export type Due = { due_on: string | null; balance: number };

export type CashWeek = {
  label: string; // "Atrasado" ou "20/10 – 26/10"
  from: string | null;
  to: string;
  inflow: number;
  outflow: number;
  balance: number; // saldo previsto no fim da semana
};

const p = (n: number) => Math.round(Number(n) * 100);
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const short = (s: string) => s.slice(8, 10) + "/" + s.slice(5, 7);

/**
 * Semanas de segunda a domingo a partir de hoje. O que já venceu (ou não tem vencimento)
 * entra na primeira linha "Atrasado": dinheiro que deveria ter entrado/saído e ainda não.
 */
export function cashForecast(opening: number, receivables: Due[], payables: Due[], weeks = 8, today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayIso = iso(start);
  const monday = new Date(start);
  monday.setDate(start.getDate() - ((start.getDay() + 6) % 7));

  const ranges: { from: string | null; to: string; label: string }[] = [];
  for (let i = 0; i < weeks; i++) {
    const a = new Date(monday);
    a.setDate(monday.getDate() + i * 7);
    const b = new Date(a);
    b.setDate(a.getDate() + 6);
    ranges.push({ from: iso(a), to: iso(b), label: `${short(iso(a))} – ${short(iso(b))}` });
  }
  const lastDay = ranges[ranges.length - 1].to;

  const bucket = (d: Due) => {
    if (!d.due_on || d.due_on < todayIso) return -1; // atrasado ou sem vencimento
    if (d.due_on > lastDay) return -2; // depois do período mostrado
    return ranges.findIndex(r => d.due_on! >= (r.from ?? "") && d.due_on! <= r.to);
  };

  let bal = p(opening);
  const rows: CashWeek[] = [];
  const later = { inflow: 0, outflow: 0 };
  const lateIn = receivables.filter(d => bucket(d) === -1).reduce((s, d) => s + p(d.balance), 0);
  const lateOut = payables.filter(d => bucket(d) === -1).reduce((s, d) => s + p(d.balance), 0);
  if (lateIn || lateOut) {
    bal += lateIn - lateOut;
    rows.push({
      label: "Atrasado",
      from: null,
      to: todayIso,
      inflow: lateIn / 100,
      outflow: lateOut / 100,
      balance: bal / 100,
    });
  }
  ranges.forEach((r, i) => {
    const inflow = receivables.filter(d => bucket(d) === i).reduce((s, d) => s + p(d.balance), 0);
    const outflow = payables.filter(d => bucket(d) === i).reduce((s, d) => s + p(d.balance), 0);
    bal += inflow - outflow;
    rows.push({ ...r, inflow: inflow / 100, outflow: outflow / 100, balance: bal / 100 });
  });
  for (const d of receivables) if (d.due_on && d.due_on > lastDay) later.inflow += p(d.balance);
  for (const d of payables) if (d.due_on && d.due_on > lastDay) later.outflow += p(d.balance);

  const firstNegative = rows.find(r => r.balance < 0) ?? null;
  return {
    opening: p(opening) / 100,
    rows,
    later: { inflow: later.inflow / 100, outflow: later.outflow / 100 },
    lowest: rows.reduce((m, r) => Math.min(m, r.balance), p(opening) / 100),
    firstNegative,
  };
}

export type ChaseInvoice = { number: string; due_on: string | null; balance: number; late: number };

/**
 * Mensagem de cobrança em inglês (vai para o cliente). O tom sobe com o atraso:
 * até 14 dias lembrete gentil; até 45 firme; depois, aviso final.
 */
export function chaseMessage(
  customer: string,
  invoices: ChaseInvoice[],
  seller: string,
  bank: { name: string | null; sort_code: string | null; account_number: string | null } | null,
): { tone: "gentle" | "firm" | "final"; text: string } {
  const overdue = invoices.filter(i => i.late > 0).sort((a, b) => b.late - a.late);
  const list = overdue.length ? overdue : invoices;
  const maxLate = overdue[0]?.late ?? 0;
  const tone = maxLate > 45 ? "final" : maxLate > 14 ? "firm" : "gentle";
  const total = list.reduce((s, i) => s + p(i.balance), 0) / 100;
  const lines = list.map(i => `• ${i.number} – ${gbp(i.balance)} (due ${ukDate(i.due_on)})`);
  const pay =
    bank?.name && bank.sort_code && bank.account_number
      ? [
          `Bank: ${bank.name} · Sort code ${bank.sort_code} · Account ${bank.account_number}. Please use the invoice number as the reference.`,
        ]
      : [];
  const opening = {
    gentle: `Hi ${customer}, just a friendly reminder that the following ${list.length === 1 ? "invoice is" : "invoices are"} now due:`,
    firm: `Hi ${customer}, our records show the following ${list.length === 1 ? "invoice is" : "invoices are"} overdue:`,
    final: `Dear ${customer}, despite previous reminders the following ${list.length === 1 ? "invoice remains" : "invoices remain"} unpaid:`,
  }[tone];
  const ask = {
    gentle:
      "Could you let us know when payment will be made? If it has already been sent, thank you and please ignore this message.",
    firm: "Please arrange payment within the next 7 days, or let us know if there is any issue with these invoices.",
    final:
      "Please settle this balance within 7 days. If we do not hear from you, we will have to put further orders on hold until the account is up to date.",
  }[tone];
  return {
    tone,
    text: [
      opening,
      "",
      ...lines,
      "",
      `Total outstanding: ${gbp(total)}`,
      "",
      ask,
      ...pay,
      "",
      `Thank you,`,
      seller,
    ].join("\n"),
  };
}
