// Documento da invoice que vai para o cliente: em inglês e no formato do Reino Unido
// (£1,234.56 e 17/10/2026). Exceção à regra do português: decisão dos sócios, out/2026.
import type { InvoiceDetail } from "./sales";
import type { Company } from "./company";

export const gbp = (n: number) =>
  n.toLocaleString("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 });
export const kgEn = (n: number) =>
  n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + " kg";
export const ukDate = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export const METHOD_EN: Record<string, string> = {
  transferencia: "Bank transfer",
  cartao: "Card",
  dinheiro: "Cash",
  cheque: "Cheque",
  outro: "Other",
};

const sum = (values: number[]) => values.reduce((s, v) => s + Math.round(v * 100), 0) / 100;

/** Valores da invoice com VAT, credit notes e pagamentos (somas em pence). */
export function invoiceTotals(inv: Pick<InvoiceDetail, "total" | "vat_total" | "credits" | "payments">) {
  const gross = sum([inv.total, inv.vat_total]);
  const credited = sum(inv.credits.map(c => sum([c.total, c.vat_total])));
  const paid = sum(inv.payments.map(p => p.amount));
  return { gross, credited, paid, balance: sum([gross, -credited, -paid]) };
}

/** Texto em inglês para colar no WhatsApp ou no email do cliente. */
export function invoiceText(inv: InvoiceDetail, company: Company | null, orgName: string): string {
  const t = invoiceTotals(inv);
  const seller = company?.legal_name ?? company?.name ?? orgName;
  const title = company?.vat_number ? "VAT invoice" : "Invoice";
  return [
    `${seller} · ${title} ${inv.number}`,
    `To: ${inv.customer.name}`,
    `Date: ${ukDate(inv.issued_on)} · Due: ${ukDate(inv.due_on)}`,
    "",
    ...inv.lines.map(
      l =>
        `• ${l.product}: ${l.boxes} box${l.boxes === 1 ? "" : "es"}, ${kgEn(l.weight_kg)} × ${gbp(l.price_kg)}/kg = ${gbp(l.amount)}`,
    ),
    "",
    `Subtotal: ${gbp(inv.total)}`,
    `VAT: ${gbp(inv.vat_total)}`,
    `Total: ${gbp(t.gross)}`,
    ...inv.credits.map(c => `Credit note ${c.number}: −${gbp(sum([c.total, c.vat_total]))}`),
    ...(t.paid > 0 ? [`Paid: −${gbp(t.paid)}`] : []),
    ...(t.credited > 0 || t.paid > 0 ? [`Balance due: ${gbp(t.balance)}`] : []),
    ...(company?.bank_name && company.sort_code && company.account_number
      ? [
          "",
          `Pay to: ${company.bank_name} · ${company.bank_account_name ?? seller}`,
          `Sort code ${company.sort_code} · Account ${company.account_number} · Reference ${inv.number}`,
        ]
      : []),
    ...(company?.vat_number ? [`VAT no. ${company.vat_number}`] : []),
  ].join("\n");
}
