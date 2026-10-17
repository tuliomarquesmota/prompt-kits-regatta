// Baixa do servidor tudo que o celular precisa para ler etiquetas offline.
import { supabase } from "./supabase";
import { saveCatalog, loadCatalog, type Catalog, type Org } from "./offline-db";
import type { LabelProfile } from "./labels";

export async function myOrgs(): Promise<Org[]> {
  const { data, error } = await supabase().from("organizations").select("id, name").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function refreshCatalog(org: Org): Promise<Catalog> {
  const sb = supabase();
  const [profiles, products, locations, suppliers] = await Promise.all([
    sb.from("label_profiles").select("id, supplier_id, match, rules").eq("org_id", org.id),
    sb.from("products").select("id, name, gtin, supplier_id").eq("org_id", org.id),
    sb.from("locations").select("id, name").eq("org_id", org.id).order("name"),
    sb.from("suppliers").select("id, name").eq("org_id", org.id),
  ]);
  for (const r of [profiles, products, locations, suppliers]) if (r.error) throw r.error;

  const supplierName = new Map((suppliers.data ?? []).map(s => [s.id as string, s.name as string]));
  const catalog: Catalog = {
    org,
    profiles: (profiles.data ?? []).map(p => ({
      id: p.id,
      supplier_id: p.supplier_id,
      supplier_name: supplierName.get(p.supplier_id) ?? "Fornecedor",
      match: p.match,
      rules: p.rules,
    })) as LabelProfile[],
    products: products.data ?? [],
    locations: locations.data ?? [],
    updatedAt: new Date().toISOString(),
  };
  await saveCatalog(catalog);
  return catalog;
}

/** Usa o catálogo salvo; se estiver online, atualiza em segundo plano. */
export async function getCatalog(org: Org, online: boolean): Promise<Catalog | null> {
  const cached = await loadCatalog(org.id);
  if (online) {
    try {
      return await refreshCatalog(org);
    } catch {
      return cached ?? null;
    }
  }
  return cached ?? null;
}
