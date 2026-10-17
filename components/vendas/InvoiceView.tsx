"use client";
import { useEffect, useState } from "react";
import type { Org } from "@/lib/offline-db";
import { brDate, errorText, getInvoice, kgText, money, type InvoiceDetail } from "@/lib/sales";

type Props = { invoiceId: string; org: Org; go: (q: string) => void };

/** Texto pronto para mandar ao cliente por WhatsApp ou email. */
function summary(inv: InvoiceDetail, orgName: string): string {
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
    `Total (sem VAT): ${money(inv.total)}`,
  ].join("\n");
}

export default function InvoiceView({ invoiceId, org, go }: Props) {
  const [inv, setInv] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    getInvoice(invoiceId)
      .then(setInv)
      .catch(e => setError(errorText(e)));
  }, [invoiceId]);

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

  return (
    <>
      <div className="row spread">
        <button className="btn small" onClick={() => go("")}>
          ← Pedidos
        </button>
        <span className="pill info">
          {inv.status === "draft" ? "Rascunho · ainda não enviada ao QuickBooks" : inv.status}
        </span>
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
                {l.boxes} cx · {kgText(l.weight_kg)} × {money(l.price_kg)}/kg
              </span>
              <span className="muted" style={{ textAlign: "right" }}>
                {l.lots.length > 0 && `Lotes ${l.lots.join(", ")}`}
              </span>
            </div>
          ))}
        </div>
        <div className="row spread" style={{ fontWeight: 700, fontSize: 18 }}>
          <span>Total (sem VAT)</span>
          <span className="mono">{money(inv.total)}</span>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Valores pelo peso real de cada caixa expedida. O VAT entra quando a invoice for para o QuickBooks.
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
    </>
  );
}
