// Dados da empresa para a invoice. Lógica pura, para testar.

export type Company = {
  name: string;
  legal_name: string | null;
  company_number: string | null;
  vat_number: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  sort_code: string | null;
  account_number: string | null;
  invoice_notes: string | null;
};

export type CompanyForm = { [K in keyof Company]: string };

export const COMPANY_FIELDS = Object.keys({
  name: 1,
  legal_name: 1,
  company_number: 1,
  vat_number: 1,
  address: 1,
  email: 1,
  phone: 1,
  bank_name: 1,
  bank_account_name: 1,
  sort_code: 1,
  account_number: 1,
  invoice_notes: 1,
} satisfies Record<keyof Company, 1>) as (keyof Company)[];

const digits = (s: string) => s.replace(/\D/g, "");

/** "gb 123 4567 89" → "GB123456789". Aceita 9 ou 12 dígitos. */
export function normalizeVat(s: string): string | null {
  const t = s.toUpperCase().replace(/[\s.-]/g, "");
  if (!t) return null;
  const m = /^(GB)?(\d{9}|\d{12})$/.exec(t);
  return m ? `GB${m[2]}` : "";
}

/** "123456" ou "12 34 56" → "12-34-56" */
export function normalizeSortCode(s: string): string | null {
  const d = digits(s);
  if (!s.trim()) return null;
  return d.length === 6 ? `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}` : "";
}

export function checkCompany(f: CompanyForm): { ok: true; row: Company } | { ok: false; error: string } {
  const clean = (k: keyof Company) => (f[k] ?? "").trim() || null;
  const name = (f.name ?? "").trim();
  if (!name) return { ok: false, error: "Digite o nome da empresa." };
  const vat = normalizeVat(f.vat_number ?? "");
  if (vat === "")
    return { ok: false, error: "Número de VAT inválido. Formato: GB seguido de 9 dígitos, ex.: GB123456789" };
  const sort = normalizeSortCode(f.sort_code ?? "");
  if (sort === "") return { ok: false, error: "Sort code inválido. São 6 dígitos, ex.: 12-34-56" };
  const acc = digits(f.account_number ?? "");
  if ((f.account_number ?? "").trim() && acc.length !== 8)
    return { ok: false, error: "Número da conta inválido. São 8 dígitos." };
  const cn = (f.company_number ?? "").toUpperCase().replace(/\s/g, "");
  if (cn && !/^[A-Z0-9]{8}$/.test(cn))
    return { ok: false, error: "Número da Companies House inválido. São 8 caracteres, ex.: 12345678" };
  const email = clean("email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Email inválido." };
  return {
    ok: true,
    row: {
      name,
      legal_name: clean("legal_name"),
      company_number: cn || null,
      vat_number: vat,
      address: clean("address"),
      email,
      phone: clean("phone"),
      bank_name: clean("bank_name"),
      bank_account_name: clean("bank_account_name"),
      sort_code: sort,
      account_number: acc || null,
      invoice_notes: clean("invoice_notes"),
    },
  };
}

/** O que falta para a invoice valer como VAT invoice no Reino Unido. */
export function invoiceGaps(c: Company | null, customerAddress: string | null, hasVat: boolean): string[] {
  const gaps: string[] = [];
  if (!c?.address) gaps.push("endereço da empresa");
  if (hasVat && !c?.vat_number) gaps.push("número de VAT da empresa");
  if (!customerAddress) gaps.push("endereço do cliente");
  return gaps;
}
