"use client";
import { useEffect, useState } from "react";
import type { Org } from "@/lib/offline-db";
import { listBills, type BillSummary } from "@/lib/finance";
import { brDate, errorText, money } from "@/lib/sales";
import { daysLate, sumMoney } from "@/lib/receivables";

type Props = { org: Org; go: (q: string) => void };

/** Contas a pagar: o que vence, o que já venceu e o total em aberto. */
export default function Bills({ org, go }: Props) {
  const [list, setList] = useState<BillSummary[] | null>(null);
  const [all, setAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setList(null);
    listBills(org.id, !all)
      .then(setList)
      .catch(e => setError(errorText(e)));
  }, [org.id, all]);

  const open = (list ?? []).filter(b => b.balance > 0);
  const late = open.filter(b => daysLate(b.due_on) > 0);
  const in7 = open.filter(b => {
    if (!b.due_on || daysLate(b.due_on) > 0) return false;
    const days = (new Date(b.due_on + "T12:00:00").getTime() - Date.now()) / 86_400_000;
    return days <= 7;
  });

  return (
    <>
      <button className="btn primary" onClick={() => go("aba=pagar&conta=nova")}>
        Lançar conta ou despesa
      </button>
      {error && <p className="note bad">{error}</p>}

      {list && !all && (
        <section className="panel" aria-label="Resumo">
          <dl>
            <div className="field">
              <dt>Total a pagar</dt>
              <dd>{money(sumMoney(open.map(b => b.balance)))}</dd>
            </div>
            <div className="field">
              <dt>Já vencido</dt>
              <dd style={{ color: late.length ? "var(--bad-fg)" : undefined }}>
                {money(sumMoney(late.map(b => b.balance)))}
              </dd>
            </div>
            <div className="field">
              <dt>Vence nos próximos 7 dias</dt>
              <dd>{money(sumMoney(in7.map(b => b.balance)))}</dd>
            </div>
          </dl>
        </section>
      )}

      <section className="panel">
        <div className="row spread">
          <strong>{all ? "Todas as contas" : `Em aberto (${open.length})`}</strong>
          <button className="btn small" onClick={() => setAll(!all)}>
            {all ? "Só em aberto" : "Ver todas"}
          </button>
        </div>
        {!list && !error && <p className="muted">Carregando…</p>}
        {list && list.length === 0 && (
          <p className="muted">
            {all ? "Nenhuma conta lançada ainda." : "Nada a pagar. Toque em “Lançar conta ou despesa” para adicionar."}
          </p>
        )}
        <div>
          {list?.map(b => {
            const d = daysLate(b.due_on);
            const tag =
              b.balance <= 0
                ? { t: "Paga", c: "ok" }
                : d > 0
                  ? { t: `${d} dias atrasada`, c: "bad" }
                  : { t: `Vence ${brDate(b.due_on)}`, c: "info" };
            return (
              <button key={b.id} className="prod" onClick={() => go(`aba=pagar&conta=${b.id}`)}>
                <span>
                  <strong>{b.payee}</strong>
                  <span className="muted" style={{ display: "block" }}>
                    {b.account}
                    {b.reference && ` · ${b.reference}`}
                  </span>
                </span>
                <span style={{ textAlign: "right" }}>
                  <span className="mono">{money(b.balance > 0 ? b.balance : b.gross)}</span>
                  <span style={{ display: "block", marginTop: 4 }}>
                    <span className={`pill ${tag.c}`}>{tag.t}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
