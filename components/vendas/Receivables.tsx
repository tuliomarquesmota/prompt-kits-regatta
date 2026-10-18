"use client";
import { useEffect, useState } from "react";
import type { Org } from "@/lib/offline-db";
import { brDate, errorText, money, openInvoices, type OpenInvoice } from "@/lib/sales";
import { BUCKET_TEXT, bucket, byCustomer, sumMoney, type CustomerDebt } from "@/lib/receivables";
import { getCompany } from "@/lib/registry";
import type { Company } from "@/lib/company";
import ChaseMessage from "@/components/financas/ChaseMessage";

/** embedded: dentro de Finanças, sem título nem botão de voltar */
type Props = { org: Org; go: (q: string) => void; embedded?: boolean };

/** Contas a receber: quem deve, quanto e há quantos dias. */
export default function Receivables({ org, go, embedded }: Props) {
  const [groups, setGroups] = useState<CustomerDebt<OpenInvoice>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<Company | null>(null);

  useEffect(() => {
    getCompany(org.id)
      .then(setCompany)
      .catch(() => setCompany(null));
  }, [org.id]);

  useEffect(() => {
    openInvoices(org.id)
      .then(list => setGroups(byCustomer(list)))
      .catch(e => setError(errorText(e)));
  }, [org.id]);

  const total = sumMoney((groups ?? []).map(g => g.total));
  const overdue = sumMoney((groups ?? []).map(g => g.overdue));

  return (
    <>
      {!embedded && (
        <div className="row spread">
          <h1>A receber</h1>
          <button className="btn small" onClick={() => go("")}>
            ← Pedidos
          </button>
        </div>
      )}

      {error && <p className="note bad">{error}</p>}
      {!groups && !error && <p className="muted">Carregando…</p>}

      {groups && (
        <section className="panel" aria-label="Resumo">
          <dl>
            <div className="field">
              <dt>Total em aberto</dt>
              <dd>{money(total)}</dd>
            </div>
            <div className="field">
              <dt>Já vencido</dt>
              <dd style={{ color: overdue > 0 ? "var(--bad-fg)" : undefined }}>{money(overdue)}</dd>
            </div>
            <div className="field">
              <dt>Clientes devendo</dt>
              <dd>{groups.length}</dd>
            </div>
          </dl>
        </section>
      )}

      {groups && groups.length === 0 && <p className="muted">Nenhuma invoice em aberto. Tudo recebido.</p>}

      {groups?.map(g => {
        const b = BUCKET_TEXT[bucket(g.maxLate)];
        return (
          <section className="panel" key={g.customer_id} aria-label={g.customer}>
            <div className="row spread">
              <strong>{g.customer}</strong>
              <span className="mono">{money(g.total)}</span>
            </div>
            <span>
              <span className={`pill ${b.tone}`}>{g.maxLate > 0 ? `${g.maxLate} dias de atraso` : b.text}</span>
              {g.overdue > 0 && g.overdue < g.total && <span className="muted"> · vencido {money(g.overdue)}</span>}
            </span>
            <div>
              {g.invoices.map(i => (
                <button key={i.id} className="prod" onClick={() => go(`invoice=${i.id}`)}>
                  <span>
                    <strong>{i.number}</strong>
                    <span className="muted" style={{ display: "block" }}>
                      Vence {brDate(i.due_on)}
                      {i.late > 0 && ` · ${i.late} dias atrasada`}
                    </span>
                  </span>
                  <span className="mono" style={{ textAlign: "right" }}>
                    {money(i.balance)}
                    {i.balance < i.gross && (
                      <span className="muted" style={{ display: "block" }}>
                        de {money(i.gross)}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
            {g.overdue > 0 && (
              <ChaseMessage
                customer={g.customer}
                invoices={g.invoices.map(i => ({
                  number: i.number,
                  due_on: i.due_on,
                  balance: i.balance,
                  late: i.late,
                }))}
                company={company}
                orgName={org.name}
              />
            )}
          </section>
        );
      })}
    </>
  );
}
