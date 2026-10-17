// Contas a pagar: regras do formulário de despesa. Lógica pura, para testar.
import { parseNumber } from "./products.ts";

export type BillForm = {
  supplier_id: string; // "" quando é um beneficiário avulso
  payee: string;
  account_id: string;
  description: string;
  reference: string;
  issued_on: string;
  due_on: string;
  net: string;
  vat_rate: string; // "0", "5", "20"
  vat_amount: string; // vazio = calcular pela taxa
};

export type BillRow = {
  supplier_id: string | null;
  payee: string | null;
  account_id: string;
  description: string | null;
  reference: string | null;
  issued_on: string;
  due_on: string | null;
  net: number;
  vat_rate: number;
  vat_amount: number;
};

/** VAT de um valor sem VAT, arredondado a 2 casas (em pence). */
export function vatOf(net: number, rate: number): number {
  return Math.round((Math.round(net * 100) * rate) / 100) / 100;
}

export function checkBill(f: BillForm): { ok: true; row: BillRow; gross: number } | { ok: false; error: string } {
  if (!f.supplier_id && !f.payee.trim())
    return { ok: false, error: "Escolha o fornecedor ou digite para quem é o pagamento." };
  if (!f.account_id) return { ok: false, error: "Escolha a categoria da despesa." };
  if (!f.issued_on) return { ok: false, error: "Digite a data da conta." };
  if (f.due_on && f.due_on < f.issued_on) return { ok: false, error: "O vencimento está antes da data da conta." };
  const net = parseNumber(f.net);
  if (net === null || Number.isNaN(net))
    return { ok: false, error: "Valor sem VAT inválido. Use só números, ex.: 1.250,00" };
  if (!["0", "5", "20"].includes(f.vat_rate)) return { ok: false, error: "Escolha a taxa de VAT: 0%, 5% ou 20%." };
  const rate = Number(f.vat_rate);
  const typed = parseNumber(f.vat_amount);
  if (typed !== null && Number.isNaN(typed)) return { ok: false, error: "Valor do VAT inválido." };
  const vat = typed ?? vatOf(net, rate);
  if (vat > net && net > 0) return { ok: false, error: "O VAT está maior que o valor da conta. Confira." };
  const n = Math.round(net * 100) / 100;
  const v = Math.round(vat * 100) / 100;
  return {
    ok: true,
    gross: (Math.round(n * 100) + Math.round(v * 100)) / 100,
    row: {
      supplier_id: f.supplier_id || null,
      payee: f.supplier_id ? null : f.payee.trim(),
      account_id: f.account_id,
      description: f.description.trim() || null,
      reference: f.reference.trim() || null,
      issued_on: f.issued_on,
      due_on: f.due_on || null,
      net: n,
      vat_rate: rate,
      vat_amount: v,
    },
  };
}
