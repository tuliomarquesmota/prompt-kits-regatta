"use client";
import type { InvoiceDetail } from "@/lib/sales";
import type { Company } from "@/lib/company";
import { gbp, invoiceTotals, kgEn, METHOD_EN, ukDate } from "@/lib/invoice-doc";

type Props = { inv: InvoiceDetail; company: Company | null; orgName: string };

/** O documento da invoice que vai para o cliente: em inglês (decisão dos sócios). Sem botões. */
export default function InvoiceDocument({ inv, company, orgName }: Props) {
  const t = invoiceTotals(inv);
  const org = { name: orgName };
  return (
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
              {l.boxes} box{l.boxes === 1 ? "" : "es"} · {kgEn(l.weight_kg)} × {gbp(l.price_kg)}/kg · VAT {l.vat_rate}%
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
  );
}
