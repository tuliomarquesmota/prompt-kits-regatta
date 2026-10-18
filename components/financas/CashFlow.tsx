"use client";
import { useEffect, useState } from "react";
import type { Org } from "@/lib/offline-db";
import { accountTotals, listBills } from "@/lib/finance";
import { natural } from "@/lib/reports";
import { cashForecast } from "@/lib/cashflow";
import { errorText, money, openInvoices } from "@/lib/sales";

type Props = { org: Org; go: (q: string) => void };
type Forecast = ReturnType<typeof cashForecast>;

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Fluxo de caixa das próximas 8 semanas: banco hoje + o que vai entrar − o que vai sair. */
export default function CashFlow({ org, go }: Props) {
  const [f, setF] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([accountTotals(org.id, null, todayIso()), openInvoices(org.id), listBills(org.id, true)])
      .then(([totals, inv, bills]) => {
        const bank = totals.find(a => a.system_key === "bank");
        setF(
          cashForecast(
            bank ? natural(bank) : 0,
            inv.map(i => ({ due_on: i.due_on, balance: i.balance })),
            bills.map(b => ({ due_on: b.due_on, balance: b.balance })),
          ),
        );
      })
      .catch(e => setError(errorText(e)));
  }, [org.id]);

  if (error) return <p className="note bad">{error}</p>;
  if (!f) return <p className="muted">Calculando…</p>;

  const neg = (n: number) => (n < 0 ? { color: "var(--bad-fg)" } : undefined);

  return (
    <>
      <section className="panel" aria-label="Resumo do caixa">
        <dl>
          <div className="field">
            <dt>No banco hoje (pelo livro)</dt>
            <dd style={neg(f.opening)}>{money(f.opening)}</dd>
          </div>
          <div className="field">
            <dt>Menor saldo previsto</dt>
            <dd style={neg(f.lowest)}>{money(f.lowest)}</dd>
          </div>
        </dl>
        {f.firstNegative ? (
          <p className="note bad" style={{ margin: 0 }}>
            O caixa fica negativo em{" "}
            {f.firstNegative.label === "Atrasado" ? "contas já vencidas" : `${f.firstNegative.label}`}:{" "}
            {money(f.firstNegative.balance)}. Cobre quem está atrasado ou adie pagamentos.
          </p>
        ) : (
          <p className="note ok" style={{ margin: 0 }}>
            O caixa fica positivo nas próximas 8 semanas.
          </p>
        )}
        {f.opening === 0 && (
          <p className="note info" style={{ margin: 0 }}>
            O saldo do banco vem do livro contábil. Se ainda não lançou o saldo inicial, faça em Livro → Lançamento
            manual (débito em Banco, crédito em Capital dos sócios).
          </p>
        )}
      </section>

      <section className="panel" aria-label="Semana a semana">
        <strong>Semana a semana</strong>
        <div>
          {f.rows.map(r => (
            <div className="item" key={r.label}>
              <strong>{r.label === "Atrasado" ? "Já vencido" : r.label}</strong>
              <span className="mono" style={{ textAlign: "right", ...neg(r.balance) }}>
                {money(r.balance)}
              </span>
              <span className="muted" style={{ gridColumn: "1 / -1" }}>
                entra {money(r.inflow)} · sai {money(r.outflow)}
              </span>
            </div>
          ))}
        </div>
        {(f.later.inflow > 0 || f.later.outflow > 0) && (
          <span className="muted">
            Depois dessas semanas: entra {money(f.later.inflow)} · sai {money(f.later.outflow)}.
          </span>
        )}
        <span className="muted">
          Considera as invoices em aberto pela data de vencimento e as contas a pagar lançadas. “Já vencido” é o que
          deveria ter entrado ou saído e ainda não aconteceu.
        </span>
      </section>

      <div className="row">
        <button className="btn" style={{ flex: 1 }} onClick={() => go("")}>
          Quem está devendo
        </button>
        <button className="btn" style={{ flex: 1 }} onClick={() => go("aba=pagar")}>
          O que vamos pagar
        </button>
      </div>
    </>
  );
}
