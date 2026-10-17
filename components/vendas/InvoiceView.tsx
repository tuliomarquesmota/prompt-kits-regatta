"use client";
import { useCallback, useEffect, useState } from "react";
import ReturnBoxes from "@/components/vendas/ReturnBoxes";
import InvoiceDocument from "@/components/vendas/InvoiceDocument";
import PaymentForm from "@/components/PaymentForm";
import type { Org } from "@/lib/offline-db";
import { errorText, getInvoice, money, recordPayment, type InvoiceDetail } from "@/lib/sales";
import { getCompany } from "@/lib/registry";
import { invoiceGaps, type Company } from "@/lib/company";
import { invoiceText, invoiceTotals } from "@/lib/invoice-doc";
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

      <InvoiceDocument inv={inv} company={company} orgName={org.name} />

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
