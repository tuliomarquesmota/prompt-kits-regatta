// Regras do cadastro de produtos, sem tela, para poder testar.

export type ProductForm = {
  name: string;
  supplier_id: string;
  gtin: string;
  sku: string;
  price: string; // como a pessoa digitou: "14,90" ou "14.90"
  minKg: string;
  maxKg: string;
  vat: string; // "0", "5" ou "20"
};

export type ProductRow = {
  name: string;
  supplier_id: string | null;
  gtin: string | null;
  sku: string | null;
  default_price_kg: number | null;
  min_box_kg: number | null;
  max_box_kg: number | null;
  vat_rate: number;
};

/** Lê número digitado com vírgula ou ponto. Vazio vira null; texto inválido vira NaN. */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(/\s/g, "");
  if (!t) return null;
  // "1.234,56" → 1234.56 ; "14,9" → 14.9 ; "14.9" → 14.9
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return /^\d+(\.\d+)?$/.test(normal) ? Number(normal) : NaN;
}

/** Confere o formulário. Devolve a linha pronta para o banco ou a primeira mensagem de erro. */
export function checkProduct(f: ProductForm): { ok: true; row: ProductRow } | { ok: false; error: string } {
  const name = f.name.trim();
  if (!name) return { ok: false, error: "Digite o nome do produto." };
  const price = parseNumber(f.price);
  const minKg = parseNumber(f.minKg);
  const maxKg = parseNumber(f.maxKg);
  if (Number.isNaN(price)) return { ok: false, error: "Preço por kg inválido. Use só números, ex.: 14,90" };
  if (Number.isNaN(minKg) || Number.isNaN(maxKg))
    return { ok: false, error: "Peso inválido. Use só números, ex.: 15 ou 22,5" };
  if (price !== null && price > 9999) return { ok: false, error: "Preço por kg alto demais. Confira o valor." };
  if ((minKg !== null && minKg > 99) || (maxKg !== null && maxKg > 99))
    return { ok: false, error: "Peso da caixa acima de 99 kg. Confira o valor." };
  if (!["0", "5", "20"].includes(f.vat)) return { ok: false, error: "Escolha a taxa de VAT: 0%, 5% ou 20%." };
  if (minKg !== null && maxKg !== null && minKg > maxKg)
    return { ok: false, error: "O peso mínimo está maior que o máximo." };
  return {
    ok: true,
    row: {
      name,
      supplier_id: f.supplier_id || null,
      gtin: f.gtin.trim() || null,
      sku: f.sku.trim() || null,
      default_price_kg: price === null ? null : Math.round(price * 100) / 100,
      min_box_kg: minKg === null ? null : Math.round(minKg * 1000) / 1000,
      max_box_kg: maxKg === null ? null : Math.round(maxKg * 1000) / 1000,
      vat_rate: Number(f.vat),
    },
  };
}

/** Link para cadastrar o produto de uma caixa lida que ainda não tem cadastro. */
export function newProductHref(productKey: string, supplierId: string | null): string {
  const q = new URLSearchParams({ produto: "novo", codigo: productKey });
  if (supplierId) q.set("fornecedor", supplierId);
  return `/cadastros?${q.toString()}`;
}

/** Número para mostrar no campo do formulário ("14,9" em vez de "14.90"). */
export function numberText(n: number | string | null): string {
  if (n === null || n === "") return "";
  return String(Number(n)).replace(".", ",");
}

/** Aviso quando o peso lido foge da faixa cadastrada no produto (pode ser leitura errada). */
export function weightWarning(
  kg: number | null,
  min: number | string | null | undefined,
  max: number | string | null | undefined,
): string | null {
  if (kg === null) return null;
  const lo = min === null || min === undefined ? null : Number(min);
  const hi = max === null || max === undefined ? null : Number(max);
  const txt = (n: number) => String(n).replace(".", ",");
  if (lo !== null && kg < lo)
    return `Peso abaixo do normal para este produto (mínimo ${txt(lo)} kg). Confira a etiqueta.`;
  if (hi !== null && kg > hi)
    return `Peso acima do normal para este produto (máximo ${txt(hi)} kg). Confira a etiqueta.`;
  return null;
}
