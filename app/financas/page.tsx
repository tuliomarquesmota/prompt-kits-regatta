"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";
import { supabase } from "@/lib/supabase";
import { currentOrg } from "@/lib/org";
import type { Org } from "@/lib/offline-db";
import Receivables from "@/components/vendas/Receivables";
import Bills from "@/components/financas/Bills";
import NewBill from "@/components/financas/NewBill";
import BillView from "@/components/financas/BillView";
import Accounts from "@/components/financas/Accounts";

const TABS = [
  { key: "", label: "A receber" },
  { key: "pagar", label: "A pagar" },
  { key: "contas", label: "Plano de contas" },
];

/** Finanças numa rota só: ?aba=pagar · ?aba=pagar&conta=nova|ID · ?aba=contas */
function Financas() {
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

  if (!org) return <p className="muted">Carregando…</p>;

  const tab = params.get("aba") ?? "";
  const conta = params.get("conta");
  const go = (q: string) => {
    // Links de invoice abrem em Vendas
    if (q.startsWith("invoice=")) return router.push(`/vendas?${q}`);
    router.push(q ? `/financas?${q}` : "/financas");
  };

  if (tab === "pagar" && conta === "nova") return <NewBill org={org} go={go} />;
  if (tab === "pagar" && conta) return <BillView key={conta} billId={conta} org={org} go={go} />;

  return (
    <>
      <div>
        <h1>Finanças</h1>
        <div className="muted">{org.name}</div>
      </div>
      <div className="tabs" role="tablist" aria-label="Área das finanças">
        {TABS.map(t => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? "on" : ""}
            onClick={() => go(t.key ? `aba=${t.key}` : "")}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "" && <Receivables org={org} go={go} embedded />}
      {tab === "pagar" && <Bills org={org} go={go} />}
      {tab === "contas" && <Accounts org={org} />}
    </>
  );
}

export default function FinancasPage() {
  return (
    <main>
      <Nav />
      <Suspense fallback={<p className="muted">Carregando…</p>}>
        <Financas />
      </Suspense>
    </main>
  );
}
