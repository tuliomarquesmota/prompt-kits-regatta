"use client";
import { useCallback, useEffect, useState } from "react";
import ReturnBoxes from "@/components/vendas/ReturnBoxes";
import PaymentForm from "@/components/PaymentForm";
import type { Org } from "@/lib/offline-db";
import { errorText, getInvoice, money, recordPayment, type InvoiceDetail } from "@/lib/sales";
import { getCompany } from "@/lib/registry";
import { invoiceGaps, type Company } from "@/lib/company";
import { gbp, invoiceText, invoiceTotals, kgEn, METHOD_EN, ukDate } from "@/lib/invoice-doc";
import { marginForInvoice } from "@/lib/finance";
import { marginBy } from "@/lib/costing";

type Props = { invoiceId: string; org: Org; go: (q: string) => void };

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
      await navigator.clipboard.writeText(invoiceText(inv, company, org.name));
      setCopied("Resumo em inglês copiado. Cole no WhatsApp ou no email do cliente.");
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

  const t = invoiceTotals(inv);
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

      {/* Documento para o cliente: em inglês (decisão dos sócios). Os controles do app seguem em português. */}
      <section className="panel" aria-label={`Invoice ${inv.number}`} lang="en-GB">
        <div className="row spread" style={{ alignItems: "flex-start" }}>
          <div>
            <strong>{company?.legal_name ?? company?.name ?? org.name}</strong>
            {company?.address && (
              <div className="muted" style={{ whiteSpace: "pre-line" }}>
                {company.address}
              </div>
            )}
            {company?.vat_number && <div className="muted">VAT no. {company.vat_number}</div>}
            {company?.company_number && <div className="muted">Company no. {company.company_number}</div>}
            <h1 style={{ fontSize: 24, marginTop: 8 }}>
              {company?.vat_number ? "VAT invoice" : "Invoice"} {inv.number}
            </h1>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="muted">Date {ukDate(inv.issued_on)}</div>
            <div className="muted">Due {ukDate(inv.due_on)}</div>
          </div>
        </div>
        <div>
          <div className="muted">Bill to</div>
          <strong>{inv.customer.name}</strong>
          {inv.customer.address && (
            <div className="muted" style={{ whiteSpace: "pre-line" }}>
              {inv.customer.address}
            </div>
          )}
          {inv.order && <div className="muted">Order {inv.order}</div>}
        </div>
        <div>
          {inv.lines.map((l, i) => (
            <div className="item" key={i}>
              <strong>{l.product}</strong>
              <span className="mono" style={{ textAlign: "right" }}>
                {gbp(l.amount)}
              </span>
              <span className="muted">
                {l.boxes} box{l.boxes === 1 ? "" : "es"} · {kgEn(l.weight_kg)} × {gbp(l.price_kg)}/kg · VAT {l.vat_rate}
                %
              </span>
              <span className="muted" style={{ textAlign: "right" }}>
                {l.lots.length > 0 && `Lot${l.lots.length === 1 ? "" : "s"} ${l.lots.join(", ")}`}
              </span>
            </div>
          ))}
        </div>
        <dl>
          <div className="field">
            <dt>Subtotal</dt>
            <dd>{gbp(inv.total)}</dd>
          </div>
          <div className="field">
            <dt>VAT</dt>
            <dd>{gbp(inv.vat_total)}</dd>
          </div>
        </dl>
        <div className="row spread" style={{ fontWeight: 700, fontSize: 18 }}>
          <span>Total</span>
          <span className="mono">{gbp(t.gross)}</span>
        </div>

        {inv.credits.map(c => (
          <div key={c.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <div className="row spread">
              <strong>Credit note {c.number}</strong>
              <span className="mono">−{gbp(Math.round((c.total + c.vat_total) * 100) / 100)}</span>
            </div>
            <div className="muted">
              {ukDate(c.issued_on)} · goods returned
              {c.reason && ` · ${c.reason}`}
              {c.vat_total > 0 && ` · includes VAT ${gbp(c.vat_total)}`}
            </div>
            {c.lines.map((l, i) => (
              <div className="muted" key={i}>
                {l.product}: {l.boxes} box{l.boxes === 1 ? "" : "es"}, {kgEn(l.weight_kg)} × {gbp(l.price_kg)}/kg ={" "}
                {gbp(l.amount)}
              </div>
            ))}
          </div>
        ))}

        {inv.payments.map(p => (
          <div key={p.id} className="row spread" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <span>
              <strong>Payment received</strong>
              <span className="muted" style={{ display: "block" }}>
                {ukDate(p.paid_on)} · {METHOD_EN[p.method] ?? p.method}
              </span>
            </span>
            <span className="mono">−{gbp(p.amount)}</span>
          </div>
        ))}

        {(t.credited > 0 || t.paid > 0) && (
          <div className="row spread" style={{ fontWeight: 700, fontSize: 18 }}>
            <span>Balance due</span>
            <span className="mono">{gbp(t.balance)}</span>
          </div>
        )}
        <p className="muted" style={{ margin: 0 }}>
          Catch-weight product: priced on the actual net weight of each box.
        </p>
        {company?.bank_name && company.sort_code && company.account_number && (
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <strong>Payment by bank transfer</strong>
            <div className="muted">
              {company.bank_name} · {company.bank_account_name ?? company.legal_name ?? company.name}
            </div>
            <div className="mono">
              Sort code {company.sort_code} · Account {company.account_number}
            </div>
            <div className="muted">Please use {inv.number} as the reference.</div>
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
          Copiar resumo (inglês)
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
