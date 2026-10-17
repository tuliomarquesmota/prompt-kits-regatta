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
import Ledger from "@/components/financas/Ledger";
import ManualEntry from "@/components/financas/ManualEntry";

const TABS = [
  { key: "", label: "A receber" },
  { key: "pagar", label: "A pagar" },
  { key: "livro", label: "Livro contábil" },
];

/** Finanças numa rota só: ?aba=pagar[&conta=nova|ID] · ?aba=livro[&mes=AAAA-MM|&ver=novo|contas] */
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
  const ver = params.get("ver");
  if (tab === "livro" && ver === "novo") return <ManualEntry org={org} go={go} />;
  if (tab === "livro" && ver === "contas")
    return (
      <>
        <div className="row spread">
          <h1>Plano de contas</h1>
          <button className="btn small" onClick={() => go("aba=livro")}>
            ← Livro
          </button>
        </div>
        <Accounts org={org} />
      </>
    );
  const now = new Date();
  const month = params.get("mes") ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

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
      {tab === "livro" && <Ledger org={org} go={go} month={month} />}
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
