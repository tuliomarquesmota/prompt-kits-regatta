"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Org } from "@/lib/offline-db";
import { listProducts, listSuppliers, registryError, type ProductItem, type Supplier } from "@/lib/registry";
import { money } from "@/lib/sales";
import { numberText } from "@/lib/products";

type Props = { org: Org; go: (q: string) => void };

/** Lista de produtos. Tocar abre a edição (?produto=ID). */
export default function Products({ org, go }: Props) {
  const [list, setList] = useState<ProductItem[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    Promise.all([listProducts(org.id), listSuppliers(org.id)])
      .then(([p, s]) => {
        setList(p);
        setSuppliers(s);
      })
      .catch(e => setError(registryError(e, "produto")));
  }, [org.id]);
  useEffect(load, [load]);

  const supplierName = useMemo(() => new Map(suppliers.map(s => [s.id, s.name])), [suppliers]);
  const term = q.trim().toLowerCase();
  const shown = (list ?? []).filter(
    p =>
      !term ||
      p.name.toLowerCase().includes(term) ||
      (p.gtin ?? "").includes(term) ||
      (p.sku ?? "").toLowerCase().includes(term) ||
      (supplierName.get(p.supplier_id ?? "") ?? "").toLowerCase().includes(term),
  );

  return (
    <>
      <button className="btn primary" onClick={() => go("produto=novo")}>
        Novo produto
      </button>
      {error && <p className="note bad">{error}</p>}
      <section className="panel">
        <div className="row spread">
          <strong>Produtos ({list?.length ?? 0})</strong>
        </div>
        {list && list.length > 6 && (
          <input
            type="search"
            aria-label="Buscar produto"
            placeholder="Buscar por nome, código ou fornecedor"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        )}
        {!list && !error && <p className="muted">Carregando produtos…</p>}
        {list && list.length === 0 && (
          <p className="muted">Nenhum produto ainda. Toque em “Novo produto” ou leia uma caixa em Receber.</p>
        )}
        {list && list.length > 0 && shown.length === 0 && <p className="muted">Nenhum produto com “{q}”.</p>}
        <div>
          {shown.map(p => (
            <button key={p.id} className="prod" onClick={() => go(`produto=${p.id}`)}>
              <span>
                <strong>{p.name}</strong>
                <span className="muted" style={{ display: "block" }}>
                  {supplierName.get(p.supplier_id ?? "") ?? "Sem fornecedor"}
                </span>
              </span>
              <span className="mono" style={{ textAlign: "right" }}>
                {p.default_price_kg !== null ? `${money(Number(p.default_price_kg))}/kg` : "Sem preço"}
              </span>
              <span className="muted mono" style={{ gridColumn: "1 / -1" }}>
                {p.gtin ?? "Sem código de etiqueta"}
                {p.min_box_kg !== null &&
                  p.max_box_kg !== null &&
                  ` · ${numberText(p.min_box_kg)}–${numberText(p.max_box_kg)} kg`}
              </span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
