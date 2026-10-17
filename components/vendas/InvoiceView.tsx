"use client";
import { useCallback, useEffect, useState } from "react";
import ReturnBoxes from "@/components/vendas/ReturnBoxes";
import PaymentForm from "@/components/PaymentForm";
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
import { sumMoney } from "@/lib/receivables";
import { getCompany } from "@/lib/registry";
import { invoiceGaps, type Company } from "@/lib/company";
import { marginForInvoice } from "@/lib/finance";
import { marginBy } from "@/lib/costing";

type Props = { invoiceId: string; org: Org; go: (q: string) => void };

/** Valores da invoice com VAT, credit notes e pagamentos. */
function totals(inv: InvoiceDetail) {
  const gross = sumMoney([inv.total, inv.vat_total]);
  const credited = sumMoney(inv.credits.map(c => sumMoney([c.total, c.vat_total])));
  const paid = sumMoney(inv.payments.map(p => p.amount));
  return { gross, credited, paid, balance: sumMoney([gross, -credited, -paid]) };
}

/** Texto pronto para mandar ao cliente por WhatsApp ou email. */
function summary(inv: InvoiceDetail, orgName: string, company: Company | null): string {
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
    ...(company?.bank_name && company.sort_code && company.account_number
      ? [
          "",
          `Pagamento: ${company.bank_name} · ${company.bank_account_name ?? company.legal_name ?? company.name}`,
          `Sort code ${company.sort_code} · Conta ${company.account_number} · Referência ${inv.number}`,
        ]
      : []),
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
  const [company, setCompany] = useState<Company | null>(null);
  const [margin, setMargin] = useState<ReturnType<typeof marginBy> | null>(null);

  useEffect(() => {
    marginForInvoice(invoiceId)
      .then(rows => setMargin(rows.length ? marginBy(rows, "product") : null))
      .catch(() => setMargin(null));
  }, [invoiceId]);

  useEffect(() => {
    getCompany(org.id)
      .then(setCompany)
      .catch(() => setCompany(null));
  }, [org.id]);

  const load = useCallback(() => {
    getInvoice(invoiceId)
      .then(setInv)
      .catch(e => setError(errorText(e)));
  }, [invoiceId]);
  useEffect(load, [load]);

  async function copy() {
    if (!inv) return;
    try {
      await navigator.clipboard.writeText(summary(inv, company?.legal_name ?? org.name, company));
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
            <strong>{company?.legal_name ?? company?.name ?? org.name}</strong>
            {company?.address && (
              <div className="muted" style={{ whiteSpace: "pre-line" }}>
                {company.address}
              </div>
            )}
            {company?.vat_number && <div className="muted">VAT {company.vat_number}</div>}
            {company?.company_number && <div className="muted">Company no. {company.company_number}</div>}
            <h1 style={{ fontSize: 24, marginTop: 8 }}>
              {company?.vat_number ? "VAT invoice" : "Invoice"} {inv.number}
            </h1>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="muted">Emitida {brDate(inv.issued_on)}</div>
            <div className="muted">Vence {brDate(inv.due_on)}</div>
          </div>
        </div>
        <div>
          <div className="muted">Cliente</div>
          <strong>{inv.customer.name}</strong>
          {inv.customer.address && (
            <div className="muted" style={{ whiteSpace: "pre-line" }}>
              {inv.customer.address}
            </div>
          )}
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
        {company?.bank_name && company.sort_code && company.account_number && (
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <strong>Pagamento por transferência</strong>
            <div className="muted">
              {company.bank_name} · {company.bank_account_name ?? company.legal_name ?? company.name}
            </div>
            <div className="mono">
              Sort code {company.sort_code} · Conta {company.account_number}
            </div>
            <div className="muted">Use {inv.number} como referência.</div>
          </div>
        )}
        {company?.invoice_notes && (
          <p className="muted" style={{ margin: 0, whiteSpace: "pre-line" }}>
            {company.invoice_notes}
          </p>
        )}
        {(company?.email || company?.phone) && (
          <p className="muted" style={{ margin: 0 }}>
            {[company.email, company.phone].filter(Boolean).join(" · ")}
          </p>
        )}
      </section>

      {margin && (
        <section className="panel no-print" aria-label="Margem desta venda">
          <div className="row spread">
            <strong>Margem desta venda</strong>
            <span className="muted">só você vê</span>
          </div>
          {margin.total.revenue > 0 ? (
            <div className="row spread" style={{ fontWeight: 700 }}>
              <span>
                Vendeu {money(margin.total.revenue)} · custou {money(margin.total.cost)}
              </span>
              <span className="mono" style={{ color: margin.total.margin < 0 ? "var(--bad-fg)" : undefined }}>
                {money(margin.total.margin)}
                {margin.total.pct !== null && ` · ${margin.total.pct}%`}
              </span>
            </div>
          ) : null}
          {margin.total.withoutCost > 0 && (
            <span className="muted">
              {margin.total.withoutCost} caixa{margin.total.withoutCost === 1 ? "" : "s"} sem custo. Lance em Finanças →
              A pagar → Custo das entregas.
            </span>
          )}
        </section>
      )}

      {(() => {
        const gaps = invoiceGaps(company, inv.customer.address, inv.vat_total > 0);
        if (!gaps.length) return null;
        return (
          <p className="note warn no-print">
            Para valer como VAT invoice falta: {gaps.join(", ")}. Preencha em <a href="/empresa">Cadastros → Empresa</a>
            {gaps.includes("endereço do cliente") && (
              <>
                {" "}
                e em <a href="/vendas?clientes">Vendas → Clientes</a>
              </>
            )}
            .
          </p>
        );
      })()}

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
          title="Registrar pagamento"
          balance={t.balance}
          save={p => recordPayment(inv.id, p)}
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
