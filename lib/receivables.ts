// Contas a receber: atraso e agrupamento por cliente. Lógica pura, para testar.

export type Bucket = "em-dia" | "1-30" | "31-60" | "60+";

export const BUCKET_TEXT: Record<Bucket, { text: string; tone: string }> = {
  "em-dia": { text: "Em dia", tone: "ok" },
  "1-30": { text: "1 a 30 dias atrasada", tone: "warn" },
  "31-60": { text: "31 a 60 dias atrasada", tone: "bad" },
  "60+": { text: "Mais de 60 dias atrasada", tone: "bad" },
};

/** Dias de atraso a partir do vencimento (0 se ainda não venceu ou sem vencimento). */
export function daysLate(dueOn: string | null, today = new Date()): number {
  if (!dueOn) return 0;
  const [y, m, d] = dueOn.slice(0, 10).split("-").map(Number);
  const due = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.round((now - due) / 86_400_000));
}

export function bucket(late: number): Bucket {
  if (late <= 0) return "em-dia";
  if (late <= 30) return "1-30";
  if (late <= 60) return "31-60";
  return "60+";
}

export type Receivable = { id: string; customer_id: string; customer: string; due_on: string | null; balance: number };

export type CustomerDebt<T extends Receivable> = {
  customer_id: string;
  customer: string;
  total: number;
  overdue: number;
  maxLate: number;
  invoices: (T & { late: number })[];
};

/** Agrupa por cliente: quem tem atraso maior aparece primeiro. Somas em pence para não errar centavo. */
export function byCustomer<T extends Receivable>(list: T[], today = new Date()): CustomerDebt<T>[] {
  const map = new Map<string, CustomerDebt<T>>();
  for (const inv of list) {
    const late = daysLate(inv.due_on, today);
    const c = map.get(inv.customer_id) ?? {
      customer_id: inv.customer_id,
      customer: inv.customer,
      total: 0,
      overdue: 0,
      maxLate: 0,
      invoices: [],
    };
    const pence = Math.round(inv.balance * 100);
    c.total = (Math.round(c.total * 100) + pence) / 100;
    if (late > 0) c.overdue = (Math.round(c.overdue * 100) + pence) / 100;
    c.maxLate = Math.max(c.maxLate, late);
    c.invoices.push({ ...inv, late });
    map.set(inv.customer_id, c);
  }
  return [...map.values()]
    .map(c => ({ ...c, invoices: c.invoices.sort((a, b) => b.late - a.late) }))
    .sort((a, b) => b.maxLate - a.maxLate || b.total - a.total);
}

/** Total de um conjunto de valores em libras, somando em pence. */
export function sumMoney(values: number[]): number {
  return values.reduce((s, v) => s + Math.round(v * 100), 0) / 100;
}
