"use client";
import { useCallback, useEffect, useState } from "react";
import ReturnBoxes from "@/components/vendas/ReturnBoxes";
import type { Org } from "@/lib/offline-db";
import {
  brDate,
  errorText,
  getInvoice,
  kgText,
  money,
  PAYMENT_METHODS,
  recordPayment,
  type InvoiceDetail,
} from "@/lib/sales";
import { numberText, parseNumber } from "@/lib/products";
import { sumMoney } from "@/lib/receivables";

type Props = { invoiceId: string; org: Org; go: (q: string) => void };

/** Valores da invoice com VAT, credit notes e pagamentos. */
function totals(inv: InvoiceDetail) {
  const gross = sumMoney([inv.total, inv.vat_total]);
  const credited = sumMoney(inv.credits.map(c => sumMoney([c.total, c.vat_total])));
  const paid = sumMoney(inv.payments.map(p => p.amount));
  return { gross, credited, paid, balance: sumMoney([gross, -credited, -paid]) };
}

/** Texto pronto para mandar ao cliente por WhatsApp ou email. */
function summary(inv: InvoiceDetail, orgName: string): string {
  const t = totals(inv);
  const lines = inv.lines.map(
    l => `• ${l.product}: ${l.boxes} cx, ${kgText(l.weight_kg)} × ${money(l.price_kg)}/kg = ${money(l.amount)}`,
  );
  return [
    `${orgName} · Invoice ${inv.number}`,
    `Cliente: ${inv.customer.name}`,
    `Data: ${brDate(inv.issued_on)} · Vencimento: ${brDate(inv.due_on)}`,
    "",
    ...lines,
    "",
    `Subtotal: ${money(inv.total)}`,
    `VAT: ${money(inv.vat_total)}`,
    `Total: ${money(t.gross)}`,
    ...inv.credits.map(c => `Credit note ${c.number}: − ${money(sumMoney([c.total, c.vat_total]))}`),
    ...(t.paid > 0 ? [`Pago: − ${money(t.paid)}`] : []),
    ...(t.credited > 0 || t.paid > 0 ? [`Saldo a pagar: ${money(t.balance)}`] : []),
  ].join("\n");
}

const STATUS: Record<string, { text: string; tone: string }> = {
  draft: { text: "Em aberto", tone: "warn" },
  sent: { text: "Enviada", tone: "info" },
  paid: { text: "Paga", tone: "ok" },
  void: { text: "Anulada", tone: "bad" },
};

export default function InvoiceView({ invoiceId, org, go }: Props) {
  const [inv, setInv] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "return" | "payment">("none");
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(() => {
    getInvoice(invoiceId)
      .then(setInv)
      .catch(e => setError(errorText(e)));
  }, [invoiceId]);
  useEffect(load, [load]);

  async function copy() {
    if (!inv) return;
    try {
      await navigator.clipboard.writeText(summary(inv, org.name));
      setCopied("Resumo copiado. Cole no WhatsApp ou no email do cliente.");
    } catch {
      setCopied("Não consegui copiar neste aparelho. Selecione o texto e copie.");
    }
  }

  if (!inv)
    return (
      <>
        <button className="btn small" style={{ alignSelf: "flex-start" }} onClick={() => go("")}>
          ← Pedidos
        </button>
        {error ? <p className="note bad">{error}</p> : <p className="muted">Carregando invoice…</p>}
      </>
    );

  const t = totals(inv);
  const st = STATUS[inv.status] ?? { text: inv.status, tone: "info" };
  const finish = (text: string) => {
    setPanel("none");
    setDone(text);
    load();
  };

  return (
    <>
      <div className="row spread">
        <button className="btn small" onClick={() => go("")}>
          ← Pedidos
        </button>
        <span className={`pill ${st.tone}`}>{st.text}</span>
      </div>

      <section className="panel" aria-label={`Invoice ${inv.number}`}>
        <div className="row spread" style={{ alignItems: "flex-start" }}>
          <div>
            <div className="muted">{org.name}</div>
            <h1 style={{ fontSize: 24 }}>Invoice {inv.number}</h1>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="muted">Emitida {brDate(inv.issued_on)}</div>
            <div className="muted">Vence {brDate(inv.due_on)}</div>
          </div>
        </div>
        <div>
          <div className="muted">Cliente</div>
          <strong>{inv.customer.name}</strong>
          {inv.order && <div className="muted">Pedido {inv.order}</div>}
        </div>
        <div>
          {inv.lines.map((l, i) => (
            <div className="item" key={i}>
              <strong>{l.product}</strong>
              <span className="mono" style={{ textAlign: "right" }}>
                {money(l.amount)}
              </span>
              <span className="muted">
                {l.boxes} cx · {kgText(l.weight_kg)} × {money(l.price_kg)}/kg · VAT {l.vat_rate}%
              </span>
              <span className="muted" style={{ textAlign: "right" }}>
                {l.lots.length > 0 && `Lotes ${l.lots.join(", ")}`}
              </span>
            </div>
          ))}
        </div>
        <dl>
          <div className="field">
            <dt>Subtotal</dt>
            <dd>{money(inv.total)}</dd>
          </div>
          <div className="field">
            <dt>VAT</dt>
            <dd>{money(inv.vat_total)}</dd>
          </div>
        </dl>
        <div className="row spread" style={{ fontWeight: 700, fontSize: 18 }}>
          <span>Total</span>
          <span className="mono">{money(t.gross)}</span>
        </div>

        {inv.credits.map(c => (
          <div key={c.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <div className="row spread">
              <strong>Credit note {c.number}</strong>
              <span className="mono">− {money(sumMoney([c.total, c.vat_total]))}</span>
            </div>
            <div className="muted">
              {brDate(c.issued_on)} · {c.restocked ? "caixas voltaram para o stock" : "caixas descartadas"}
              {c.reason && ` · ${c.reason}`}
              {c.vat_total > 0 && ` · inclui VAT ${money(c.vat_total)}`}
            </div>
            {c.lines.map((l, i) => (
              <div className="muted" key={i}>
                {l.product}: {l.boxes} cx, {kgText(l.weight_kg)} × {money(l.price_kg)}/kg = {money(l.amount)}
              </div>
            ))}
          </div>
        ))}

        {inv.payments.map(p => (
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

        {(t.credited > 0 || t.paid > 0) && (
          <div className="row spread" style={{ fontWeight: 700, fontSize: 18 }}>
            <span>Saldo a pagar</span>
            <span className="mono">{money(t.balance)}</span>
          </div>
        )}
        <p className="muted" style={{ margin: 0 }}>
          Valores pelo peso real de cada caixa expedida.
        </p>
      </section>

      <div className="row">
        <button className="btn primary" onClick={copy}>
          Copiar resumo
        </button>
        <button className="btn" onClick={() => window.print()}>
          Imprimir / PDF
        </button>
      </div>
      {copied && <p className="note ok">{copied}</p>}

      {done && (
        <p className="note ok" role="status">
          {done}
        </p>
      )}

      {panel === "payment" && (
        <PaymentForm
          invoiceId={inv.id}
          balance={t.balance}
          onCancel={() => setPanel("none")}
          onDone={() => finish("Pagamento registrado.")}
        />
      )}
      {panel === "return" && (
        <ReturnBoxes
          invoiceId={inv.id}
          onCancel={() => setPanel("none")}
          onDone={() => finish("Credit note gerada. Ela aparece na invoice acima.")}
        />
      )}
      {panel === "none" && (
        <>
          {t.balance > 0 && (
            <button
              className="btn primary"
              onClick={() => {
                setDone(null);
                setPanel("payment");
              }}
            >
              Registrar pagamento
            </button>
          )}
          <button
            className="btn"
            onClick={() => {
              setDone(null);
              setPanel("return");
            }}
          >
            Cliente devolveu caixas
          </button>
        </>
      )}
    </>
  );
}

function PaymentForm({
  invoiceId,
  balance,
  onCancel,
  onDone,
}: {
  invoiceId: string;
  balance: number;
  onCancel: () => void;
  onDone: () => void;
}) {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [amount, setAmount] = useState(numberText(balance.toFixed(2)));
  const [paidOn, setPaidOn] = useState(iso);
  const [method, setMethod] = useState("transferencia");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseNumber(amount);
    if (value === null || Number.isNaN(value) || value <= 0)
      return setMsg("Valor inválido. Use só números, ex.: 324,37");
    if (Math.round(value * 100) > Math.round(balance * 100))
      return setMsg(`O valor passa do saldo em aberto (${money(balance)}).`);
    setBusy(true);
    setMsg(null);
    try {
      await recordPayment(invoiceId, { amount: value, paid_on: paidOn, method, note });
      onDone();
    } catch (err) {
      setMsg(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit} aria-label="Registrar pagamento">
      <div className="row spread">
        <strong>Registrar pagamento</strong>
        <button type="button" className="btn small" onClick={onCancel} disabled={busy}>
          Fechar
        </button>
      </div>
      <label>
        Valor recebido (£)
        <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
      </label>
      <span className="muted">
        Saldo em aberto: {money(balance)}. Pode registrar um valor menor se o pagamento foi parcial.
      </span>
      <label>
        Data do pagamento
        <input type="date" value={paidOn} max={iso} onChange={e => setPaidOn(e.target.value)} />
      </label>
      <label>
        Forma de pagamento
        <select value={method} onChange={e => setMethod(e.target.value)}>
          {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        Observação (opcional)
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Ex.: referência do banco" />
      </label>
      <button className="btn primary" disabled={busy}>
        {busy ? "Registrando…" : "Registrar pagamento"}
      </button>
      {msg && (
        <p className="note bad" role="status">
          {msg}
        </p>
      )}
    </form>
  );
}
