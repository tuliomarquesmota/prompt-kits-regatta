"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";
import SectionHeader from "@/components/SectionHeader";
import { CADASTRO_TABS, cadastroHref } from "@/components/cadastros/tabs";
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

  const header = (
    <SectionHeader
      title="Cadastros"
      tabs={CADASTRO_TABS}
      current={produto ? "" : tab}
      onTab={k => router.push(cadastroHref(k))}
    />
  );

  if (produto)
    return (
      <>
        {header}
        <ProductEditor
          key={produto}
          org={org}
          productId={produto}
          presetCode={params.get("codigo")}
          presetSupplier={params.get("fornecedor")}
          go={go}
        />
      </>
    );

  return (
    <>
      {header}

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
