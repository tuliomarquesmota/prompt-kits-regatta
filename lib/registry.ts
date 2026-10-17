// Cadastros no Supabase: produtos, fornecedores e câmaras.
import { supabase } from "./supabase";
import type { ProductRow } from "./products";

export type Supplier = { id: string; name: string; country: string | null };
export type Place = { id: string; name: string };
export type ProductItem = {
  id: string;
  name: string;
  supplier_id: string | null;
  gtin: string | null;
  sku: string | null;
  default_price_kg: number | null;
  min_box_kg: number | null;
  max_box_kg: number | null;
  vat_rate: number;
};

/** Mensagem clara para os erros mais comuns dos cadastros. */
export function registryError(e: unknown, what: "produto" | "fornecedor" | "câmara"): string {
  const err = e as { code?: string; message?: string };
  const m = err?.message ?? "";
  if (/fetch|network/i.test(m)) return "Sem internet. Cadastros precisam de conexão; tente de novo quando conectar.";
  if (err?.code === "23505")
    return what === "produto"
      ? "Já existe um produto com este código de etiqueta."
      : `Já existe ${what === "câmara" ? "uma câmara" : "um fornecedor"} com este nome.`;
  if (err?.code === "23503")
    return what === "produto"
      ? "Este produto já tem caixas ou vendas, então não pode ser apagado. Você pode mudar o nome."
      : what === "câmara"
        ? "Ainda há caixas guardadas nesta câmara. Não dá para apagar; você pode mudar o nome."
        : "Ainda há produtos, caixas ou perfil de etiqueta ligados a este fornecedor. Não dá para apagar; você pode mudar o nome.";
  return m || "Algo deu errado. Tente de novo.";
}

const productCols = "id, name, supplier_id, gtin, sku, default_price_kg, min_box_kg, max_box_kg, vat_rate";

export async function listProducts(orgId: string): Promise<ProductItem[]> {
  const { data, error } = await supabase().from("products").select(productCols).eq("org_id", orgId).order("name");
  if (error) throw error;
  return (data ?? []) as ProductItem[];
}

export async function saveProduct(orgId: string, id: string | null, row: ProductRow): Promise<void> {
  const sb = supabase();
  const { error } = id
    ? await sb.from("products").update(row).eq("id", id).eq("org_id", orgId)
    : await sb.from("products").insert({ ...row, org_id: orgId });
  if (error) throw error;
}

export async function deleteProduct(orgId: string, id: string): Promise<void> {
  const { error } = await supabase().from("products").delete().eq("id", id).eq("org_id", orgId);
  if (error) throw error;
}

export async function listSuppliers(orgId: string): Promise<Supplier[]> {
  const { data, error } = await supabase()
    .from("suppliers")
    .select("id, name, country")
    .eq("org_id", orgId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function saveSupplier(
  orgId: string,
  id: string | null,
  row: { name: string; country: string | null },
): Promise<void> {
  const sb = supabase();
  // Nome repetido: a tabela não trava, então conferimos aqui
  const { data: same } = await sb.from("suppliers").select("id").eq("org_id", orgId).ilike("name", row.name);
  if ((same ?? []).some(s => s.id !== id)) throw { code: "23505" };
  const { error } = id
    ? await sb.from("suppliers").update(row).eq("id", id).eq("org_id", orgId)
    : await sb.from("suppliers").insert({ ...row, org_id: orgId });
  if (error) throw error;
}

export async function deleteSupplier(orgId: string, id: string): Promise<void> {
  const sb = supabase();
  // Apagar o fornecedor apagaria junto o perfil de etiqueta dele; não deixamos.
  const { count } = await sb
    .from("label_profiles")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("supplier_id", id);
  if (count) throw { code: "23503" };
  const { error } = await sb.from("suppliers").delete().eq("id", id).eq("org_id", orgId);
  if (error) throw error;
}

export async function listPlaces(orgId: string): Promise<Place[]> {
  const { data, error } = await supabase().from("locations").select("id, name").eq("org_id", orgId).order("name");
  if (error) throw error;
  return data ?? [];
}

export async function savePlace(orgId: string, id: string | null, name: string): Promise<void> {
  const sb = supabase();
  const { error } = id
    ? await sb.from("locations").update({ name }).eq("id", id).eq("org_id", orgId)
    : await sb.from("locations").insert({ name, org_id: orgId });
  if (error) throw error;
}

export async function deletePlace(orgId: string, id: string): Promise<void> {
  const { error } = await supabase().from("locations").delete().eq("id", id).eq("org_id", orgId);
  if (error) throw error;
}
