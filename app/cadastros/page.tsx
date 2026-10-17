"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";
import { supabase } from "@/lib/supabase";
import { currentOrg } from "@/lib/org";
import type { Org } from "@/lib/offline-db";
import Products from "@/components/cadastros/Products";
import ProductEditor from "@/components/cadastros/ProductEditor";
import NameList from "@/components/cadastros/NameList";
import {
  deletePlace,
  deleteSupplier,
  listPlaces,
  listSuppliers,
  registryError,
  savePlace,
  saveSupplier,
} from "@/lib/registry";

const TABS = [
  { key: "", label: "Produtos" },
  { key: "fornecedores", label: "Fornecedores" },
  { key: "camaras", label: "Câmaras" },
  { key: "empresa", label: "Empresa" },
];

/** Cadastros numa rota só: ?aba=fornecedores · ?aba=camaras · ?produto=novo|ID */
function Cadastros() {
  const router = useRouter();
  const params = useSearchParams();
  const [org, setOrg] = useState<Org | null>(null);

  useEffect(() => {
    const o = currentOrg();
    supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (!data.session || !o) return router.replace("/login");
        setOrg(o);
      });
  }, [router]);

  const orgId = org?.id ?? "";
  const loadSuppliers = useCallback(
    () => listSuppliers(orgId).then(l => l.map(s => ({ id: s.id, name: s.name, extra: s.country }))),
    [orgId],
  );
  const loadPlaces = useCallback(() => listPlaces(orgId), [orgId]);
  const supplierError = useCallback((e: unknown) => registryError(e, "fornecedor"), []);
  const placeError = useCallback((e: unknown) => registryError(e, "câmara"), []);

  if (!org) return <p className="muted">Carregando…</p>;

  const produto = params.get("produto");
  const tab = params.get("aba") ?? "";
  const go = (q: string) => router.push(q ? `/cadastros?${q}` : "/cadastros");

  if (produto)
    return (
      <ProductEditor
        key={produto}
        org={org}
        productId={produto}
        presetCode={params.get("codigo")}
        presetSupplier={params.get("fornecedor")}
        go={go}
      />
    );

  return (
    <>
      <div>
        <h1>Cadastros</h1>
        <div className="muted">{org.name}</div>
      </div>
      <div className="tabs" role="tablist" aria-label="Tipo de cadastro">
        {TABS.map(t => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? "on" : ""}
            onClick={() => (t.key === "empresa" ? router.push("/empresa") : go(t.key ? `aba=${t.key}` : ""))}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "" && <Products org={org} go={go} />}
      {tab === "fornecedores" && (
        <NameList
          key="fornecedores"
          title="Fornecedores"
          noun="fornecedor"
          placeholder="Teys Australia"
          extraLabel="País (opcional)"
          extraPlaceholder="Austrália"
          empty="Nenhum fornecedor ainda."
          load={loadSuppliers}
          save={(id, name, country) => saveSupplier(org.id, id, { name, country })}
          remove={id => deleteSupplier(org.id, id)}
          errorText={supplierError}
        />
      )}
      {tab === "camaras" && (
        <NameList
          key="camaras"
          title="Câmaras e locais"
          noun="local"
          placeholder="Câmara 3 · prateleira A"
          empty="Nenhum local ainda."
          load={loadPlaces}
          save={(id, name) => savePlace(org.id, id, name)}
          remove={id => deletePlace(org.id, id)}
          errorText={placeError}
        />
      )}
    </>
  );
}

export default function CadastrosPage() {
  return (
    <main>
      <Nav />
      <Suspense fallback={<p className="muted">Carregando…</p>}>
        <Cadastros />
      </Suspense>
    </main>
  );
}
