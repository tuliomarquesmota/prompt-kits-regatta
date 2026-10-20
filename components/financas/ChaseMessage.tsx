"use client";
import { useState } from "react";
import { chaseMessage, type ChaseInvoice } from "@/lib/cashflow";
import type { Company } from "@/lib/company";

type Props = { customer: string; invoices: ChaseInvoice[]; company: Company | null; orgName: string };

const TONE: Record<string, string> = {
  gentle: "Lembrete gentil (até 14 dias de atraso)",
  firm: "Cobrança firme (15 a 45 dias)",
  final: "Aviso final (mais de 45 dias)",
};

/** Mensagem de cobrança em inglês, pronta para copiar, mandar no WhatsApp ou por email. */
export default function ChaseMessage({ customer, invoices, company, orgName }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const seller = company?.legal_name ?? company?.name ?? orgName;
  const msg = chaseMessage(
    customer,
    invoices,
    seller,
    company ? { name: company.bank_name, sort_code: company.sort_code, account_number: company.account_number } : null,
  );

  if (!open)
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        Mensagem de cobrança
      </button>
    );

  async function copy() {
    try {
      await navigator.clipboard.writeText(msg.text);
      setCopied("Mensagem copiada.");
    } catch {
      setCopied("Não consegui copiar neste aparelho. Selecione o texto e copie.");
    }
  }

  const subject = `Overdue invoices – ${seller}`;
  return (
    <div style={{ display: "grid", gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
      <div className="row spread">
        <strong>Mensagem de cobrança</strong>
        <span className="muted">{TONE[msg.tone]}</span>
      </div>
      <textarea readOnly rows={10} value={msg.text} lang="en-GB" aria-label="Mensagem de cobrança em inglês" />
      <div className="row">
        <button className="btn primary" style={{ flex: 1 }} onClick={copy}>
          Copiar
        </button>
        <a
          className="btn"
          style={{ flex: 1 }}
          href={`https://wa.me/?text=${encodeURIComponent(msg.text)}`}
          target="_blank"
          rel="noreferrer"
        >
          WhatsApp
        </a>
        <a
          className="btn"
          style={{ flex: 1 }}
          href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg.text)}`}
        >
          Email
        </a>
      </div>
      {copied && <span className="muted">{copied}</span>}
      <button className="btn small" style={{ justifySelf: "start" }} onClick={() => setOpen(false)}>
        Fechar
      </button>
    </div>
  );
}
