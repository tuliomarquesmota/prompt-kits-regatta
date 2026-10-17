"use client";
import { useCallback, useEffect, useState } from "react";
import type { Org } from "@/lib/offline-db";
import PaymentForm from "@/components/PaymentForm";
import { getBill, recordBillPayment, voidBill, type BillDetail } from "@/lib/finance";
import { brDate, errorText, money, PAYMENT_METHODS } from "@/lib/sales";
import { daysLate } from "@/lib/receivables";

type Props = { billId: string; org: Org; go: (q: string) => void };

export default function BillView({ billId, org, go }: Props) {
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(() => {
    getBill(billId)
      .then(setBill)
      .catch(e => setError(errorText(e)));
  }, [billId]);
  useEffect(load, [load]);

  async function cancelBill() {
    if (!confirmVoid) return setConfirmVoid(true);
    try {
      await voidBill(org.id, billId);
      go("aba=pagar");
    } catch (e) {
      setError(errorText(e));
      setConfirmVoid(false);
    }
  }

  const back = (
    <button className="btn small" onClick={() => go("aba=pagar")}>
      ← A pagar
    </button>
  );
  if (!bill)
    return (
      <>
        <div>{back}</div>
        {error ? <p className="note bad">{error}</p> : <p className="muted">Carregando…</p>}
      </>
    );

  const late = daysLate(bill.due_on);
  const tag =
    bill.status === "void"
      ? { t: "Anulada", c: "bad" }
      : bill.balance <= 0
        ? { t: "Paga", c: "ok" }
        : late > 0
          ? { t: `${late} dias atrasada`, c: "bad" }
          : { t: "Em aberto", c: "warn" };

  return (
    <>
      <div className="row spread">
        {back}
        <span className={`pill ${tag.c}`}>{tag.t}</span>
      </div>

      <section className="panel">
        <div>
          <div className="muted">{bill.account}</div>
          <h1>{bill.payee}</h1>
          {bill.description && <div className="muted">{bill.description}</div>}
        </div>
        <dl>
          {bill.reference && (
            <div className="field">
              <dt>Referência</dt>
              <dd>{bill.reference}</dd>
            </div>
          )}
          <div className="field">
            <dt>Data</dt>
            <dd>{brDate(bill.issued_on)}</dd>
          </div>
          <div className="field">
            <dt>Vencimento</dt>
            <dd>{brDate(bill.due_on)}</dd>
          </div>
          <div className="field">
            <dt>Valor sem VAT</dt>
            <dd>{money(bill.net)}</dd>
          </div>
          <div className="field">
            <dt>VAT ({bill.vat_rate}%)</dt>
            <dd>{money(bill.vat_amount)}</dd>
          </div>
        </dl>
        <div className="row spread" style={{ fontWeight: 700, fontSize: 18 }}>
          <span>Total</span>
          <span className="mono">{money(bill.gross)}</span>
        </div>
        {bill.payments.map(p => (
          <div key={p.id} className="row spread" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <span>
              <strong>Pagamento</strong>
              <span className="muted" style={{ display: "block" }}>
                {brDate(p.paid_on)} · {PAYMENT_METHODS[p.method] ?? p.method}
                {p.note && ` · ${p.note}`}
              </span>
            </span>
            <span className="mono">− {money(p.amount)}</span>
          </div>
        ))}
        {bill.payments.length > 0 && (
          <div className="row spread" style={{ fontWeight: 700 }}>
            <span>Saldo a pagar</span>
            <span className="mono">{money(bill.balance)}</span>
          </div>
        )}
      </section>

      {done && <p className="note ok">{done}</p>}
      {error && <p className="note bad">{error}</p>}

      {paying ? (
        <PaymentForm
          title="Registrar pagamento feito"
          balance={bill.balance}
          save={p => recordBillPayment(bill.id, p)}
          onCancel={() => setPaying(false)}
          onDone={() => {
            setPaying(false);
            setDone("Pagamento registrado.");
            load();
          }}
        />
      ) : (
        bill.status !== "void" &&
        bill.balance > 0 && (
          <button
            className="btn primary"
            onClick={() => {
              setDone(null);
              setPaying(true);
            }}
          >
            Registrar pagamento
          </button>
        )
      )}
      {bill.status !== "void" && bill.payments.length === 0 && !paying && (
        <button className="btn" onClick={cancelBill}>
          {confirmVoid ? "Toque de novo para anular esta conta" : "Anular conta (lançada errado)"}
        </button>
      )}
    </>
  );
}
