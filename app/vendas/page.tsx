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
  if (invoice) return <InvoiceView invoiceId={invoice} org={org} go={go} />;
  if (pedido) return <Dispatch orderId={pedido} org={org} go={go} />;
  if (params.has("novo")) return <NewOrder org={org} go={go} />;
  if (params.has("clientes")) return <Customers org={org} go={go} />;
  if (params.has("receber")) return <Receivables org={org} go={go} />;
  return <OrdersList org={org} go={go} />;
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
