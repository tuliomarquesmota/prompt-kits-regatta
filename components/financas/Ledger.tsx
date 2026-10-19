"use client";
import { useEffect, useState } from "react";
import type { Org } from "@/lib/offline-db";
import { getBooksLock, listEntries, type JournalEntry } from "@/lib/finance";
import { brDate, errorText, money } from "@/lib/sales";
import { isLocked, monthLabel, monthRange, shiftMonth } from "@/lib/journal";
import { sumMoney } from "@/lib/receivables";

type Props = { org: Org; go: (q: string) => void; month: string };

const SOURCE: Record<string, string> = {
  invoices: "Invoice",
  credit_notes: "Credit note",
  payments: "Recebimento",
  bills: "Conta a pagar",
  bill_payments: "Pagamento",
};

/** Livro diário: os lançamentos do mês, com débitos e créditos. */
export default function Ledger({ org, go, month }: Props) {
  const [list, setList] = useState<JournalEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lock, setLock] = useState<string | null>(null);

  useEffect(() => {
    getBooksLock(org.id)
      .then(setLock)
      .catch(() => setLock(null));
  }, [org.id]);

  useEffect(() => {
    setList(null);
    const r = monthRange(month);
    listEntries(org.id, r.from, r.to)
      .then(setList)
      .catch(e => setError(errorText(e)));
  }, [org.id, month]);

  const total = sumMoney((list ?? []).flatMap(e => e.lines.map(l => l.debit)));
  const open = (e: JournalEntry) => {
    if (e.source_table === "invoices") return go(`invoice=${e.source_id}`);
    if (e.source_table === "bills") return go(`aba=pagar&conta=${e.source_id}`);
  };

  return (
    <>
      <div className="row">
        <button className="btn primary" style={{ flex: 1 }} onClick={() => go("aba=livro&ver=novo")}>
          Lançamento manual
        </button>
        <button className="btn" style={{ flex: 1 }} onClick={() => go("aba=livro&ver=contas")}>
          Plano de contas
        </button>
      </div>
      <div className="row">
        <button className="btn" style={{ flex: 1 }} onClick={() => go("aba=livro&ver=fechamento")}>
          Fechar mês
        </button>
        <button className="btn" style={{ flex: 1 }} onClick={() => go("aba=livro&ver=historico")}>
          Histórico
        </button>
      </div>

      <div className="row spread">
        <button
          className="btn small"
          onClick={() => go(`aba=livro&mes=${shiftMonth(month, -1)}`)}
          aria-label="Mês anterior"
        >
          ←
        </button>
        <span style={{ textAlign: "center" }}>
          <strong>{monthLabel(month)}</strong>
          {isLocked(monthRange(month).to, lock) && (
            <span className="pill ok" style={{ marginLeft: 8 }}>
              Fechado
            </span>
          )}
        </span>
        <button
          className="btn small"
          onClick={() => go(`aba=livro&mes=${shiftMonth(month, 1)}`)}
          aria-label="Próximo mês"
        >
          →
        </button>
      </div>

      {error && <p className="note bad">{error}</p>}
      {!list && !error && <p className="muted">Carregando lançamentos…</p>}
      {list && list.length === 0 && (
        <p className="muted">
          Nenhum lançamento neste mês. Invoices, credit notes, pagamentos e contas a pagar entram aqui sozinhos.
        </p>
      )}
      {list && list.length > 0 && (
        <p className="muted" style={{ margin: 0 }}>
          {list.length} lançamento{list.length === 1 ? "" : "s"} · {money(total)} em débitos e o mesmo em créditos
        </p>
      )}

      {list?.map(e => {
        const linked = e.source_table === "invoices" || e.source_table === "bills";
        return (
          <section className="panel" key={e.id} style={{ gap: 6 }}>
            <div className="row spread" style={{ alignItems: "flex-start" }}>
              <span>
                <strong>{e.description}</strong>
                <span className="muted" style={{ display: "block" }}>
                  {brDate(e.entry_date)} · {e.source_table ? (SOURCE[e.source_table] ?? e.source_table) : "Manual"}
                </span>
              </span>
              {linked && (
                <button className="btn small" onClick={() => open(e)}>
                  Abrir
                </button>
              )}
            </div>
            <div>
              {e.lines.map((l, i) => (
                <div className="item" key={i} style={{ padding: "6px 0" }}>
                  <span style={{ paddingLeft: l.debit > 0 ? 0 : 16 }}>
                    <span className="muted mono">{l.code}</span> {l.account}
                    {l.memo && <span className="muted"> · {l.memo}</span>}
                  </span>
                  <span className="mono" style={{ textAlign: "right" }}>
                    {l.debit > 0 ? `D ${money(l.debit)}` : `C ${money(l.credit)}`}
                  </span>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
