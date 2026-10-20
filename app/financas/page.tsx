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
import Reports from "@/components/financas/Reports";
import Receipts from "@/components/financas/Receipts";
import ReceiptCost from "@/components/financas/ReceiptCost";
import CashFlow from "@/components/financas/CashFlow";
import SectionHeader from "@/components/SectionHeader";
import Closing from "@/components/financas/Closing";
import History from "@/components/financas/History";

const TABS = [
  { key: "", label: "A receber" },
  { key: "pagar", label: "A pagar" },
  { key: "caixa", label: "Caixa" },
  { key: "relatorios", label: "Relatórios" },
  { key: "livro", label: "Livro" },
];
const LIVRO_TABS = [
  { key: "", label: "Lançamentos" },
  { key: "contas", label: "Plano" },
  { key: "fechamento", label: "Fechar mês" },
  { key: "historico", label: "Histórico" },
];
const PAGAR_TABS = [
  { key: "", label: "Contas" },
  { key: "entregas", label: "Custo das entregas" },
];

/** Finanças numa rota só: ?aba=pagar[&conta=nova|ID] · ?aba=livro[&mes=AAAA-MM|&ver=novo|contas|fechamento|historico] */
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

  const entrega = params.get("entrega");
  const ver = params.get("ver");
  const now = new Date();
  const month = params.get("mes") ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Segunda fileira de abas e qual está ativa
  const sub = tab === "livro" ? LIVRO_TABS : tab === "pagar" ? PAGAR_TABS : undefined;
  const subCurrent =
    tab === "livro"
      ? ver === "novo" || !ver
        ? ""
        : ver
      : tab === "pagar"
        ? ver === "entregas" || entrega
          ? "entregas"
          : ""
        : "";

  let body: React.ReactNode;
  if (tab === "pagar" && entrega) body = <ReceiptCost key={entrega} org={org} receiptId={entrega} go={go} />;
  else if (tab === "pagar" && ver === "entregas") body = <Receipts org={org} go={go} />;
  else if (tab === "pagar" && conta === "nova") body = <NewBill org={org} go={go} />;
  else if (tab === "pagar" && conta) body = <BillView key={conta} billId={conta} org={org} go={go} />;
  else if (tab === "pagar") body = <Bills org={org} go={go} />;
  else if (tab === "livro" && ver === "novo") body = <ManualEntry org={org} go={go} />;
  else if (tab === "livro" && ver === "fechamento") body = <Closing org={org} go={go} />;
  else if (tab === "livro" && ver === "historico") body = <History org={org} go={go} />;
  else if (tab === "livro" && ver === "contas") body = <Accounts org={org} />;
  else if (tab === "livro") body = <Ledger org={org} go={go} month={month} />;
  else if (tab === "caixa") body = <CashFlow org={org} go={go} />;
  else if (tab === "relatorios") body = <Reports org={org} />;
  else body = <Receivables org={org} go={go} embedded />;

  return (
    <>
      <SectionHeader
        title="Finanças"
        tabs={TABS}
        current={tab}
        onTab={k => go(k ? `aba=${k}` : "")}
        sub={sub}
        subCurrent={subCurrent}
        onSub={k => go(`aba=${tab}${k ? `&ver=${k}` : ""}`)}
      />
      {body}
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
