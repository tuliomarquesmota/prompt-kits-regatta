"use client";
import { useEffect, useState } from "react";
import type { Org } from "@/lib/offline-db";
import { listReceipts, type ReceiptSummary } from "@/lib/finance";
import { brDate, errorText, kgText, money } from "@/lib/sales";

type Props = { org: Org; go: (q: string) => void };

/** Entregas recebidas, para lançar o custo de cada uma. */
export default function Receipts({ org, go }: Props) {
  const [list, setList] = useState<ReceiptSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listReceipts(org.id)
      .then(setList)
      .catch(e => setError(errorText(e)));
  }, [org.id]);

  const pending = (list ?? []).filter(r => !r.costed_at).length;

  return (
    <>
      <p className="note info">
        Para cada entrega, digite o preço por kg de cada produto (da invoice do fornecedor) e os custos extras: frete,
        porto, inspeção. O app calcula o custo de cada caixa e passa a mostrar a margem de cada venda.
      </p>
      {error && <p className="note bad">{error}</p>}
      {!list && !error && <p className="muted">Carregando entregas…</p>}
      {list && list.length === 0 && (
        <p className="muted">Nenhuma entrega com caixas ainda. Elas vêm da tela Receber.</p>
      )}
      {list && pending > 0 && (
        <p className="note warn">
          {pending} entrega{pending === 1 ? "" : "s"} sem custo lançado.
        </p>
      )}
      <section className="panel">
        <div>
          {list?.map(r => (
            <button key={r.id} className="prod" onClick={() => go(`aba=pagar&entrega=${r.id}`)}>
              <span>
                <strong>{r.reference ?? `Entrega de ${brDate(r.received_at)}`}</strong>
                <span className="muted" style={{ display: "block" }}>
                  {brDate(r.received_at)} · {r.boxes} cx · {kgText(r.weight_kg)}
                </span>
                <span className="muted" style={{ display: "block" }}>
                  {r.products.slice(0, 3).join(", ")}
                  {r.products.length > 3 && ` e mais ${r.products.length - 3}`}
                </span>
              </span>
              <span style={{ textAlign: "right" }}>
                {r.costed_at ? (
                  <>
                    <span className="pill ok">Custo lançado</span>
                    {r.extra_costs > 0 && (
                      <span className="muted" style={{ display: "block", marginTop: 4 }}>
                        extras {money(r.extra_costs)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="pill warn">Sem custo</span>
                )}
              </span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
