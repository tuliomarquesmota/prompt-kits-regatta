"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";
import { supabase } from "@/lib/supabase";
import { currentOrg } from "@/lib/org";
import type { Org } from "@/lib/offline-db";
import OrdersList from "@/components/vendas/OrdersList";
import Customers from "@/components/vendas/Customers";
import NewOrder from "@/components/vendas/NewOrder";
import Dispatch from "@/components/vendas/Dispatch";
import InvoiceView from "@/components/vendas/InvoiceView";
import Receivables from "@/components/vendas/Receivables";
import SectionHeader from "@/components/SectionHeader";

const TABS = [
  { key: "", label: "Pedidos" },
  { key: "clientes", label: "Clientes" },
  { key: "receber", label: "A receber" },
];

/** Vendas numa rota só: ?novo · ?clientes · ?receber · ?pedido=ID (expedição) · ?invoice=ID */
function Vendas() {
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

  const go = (q: string) => router.push(q ? `/vendas?${q}` : "/vendas");

  if (!org) return <p className="muted">Carregando…</p>;
  const pedido = params.get("pedido");
  const invoice = params.get("invoice");
  const current = params.has("clientes") ? "clientes" : params.has("receber") ? "receber" : "";

  let body: React.ReactNode;
  if (invoice) body = <InvoiceView invoiceId={invoice} org={org} go={go} />;
  else if (pedido) body = <Dispatch orderId={pedido} org={org} go={go} />;
  else if (params.has("novo")) body = <NewOrder org={org} go={go} />;
  else if (current === "clientes") body = <Customers org={org} go={go} />;
  else if (current === "receber") body = <Receivables org={org} go={go} embedded />;
  else body = <OrdersList org={org} go={go} />;

  return (
    <>
      <SectionHeader title="Vendas" tabs={TABS} current={current} onTab={go} />
      {body}
    </>
  );
}

export default function VendasPage() {
  return (
    <main>
      <Nav />
      <Suspense fallback={<p className="muted">Carregando…</p>}>
        <Vendas />
      </Suspense>
    </main>
  );
}
