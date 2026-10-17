"use client";
import { useEffect, useState } from "react";
import { marginBy, type MarginGroup, type MarginRow } from "@/lib/costing";
import { marginRows, stockValue } from "@/lib/finance";
import { errorText, kgText, money } from "@/lib/sales";

type Props = { orgId: string; from: string; to: string; label: string };

function Row({ g }: { g: MarginGroup }) {
  return (
    <div className="item">
      <strong>{g.name}</strong>
      <span className="mono" style={{ textAlign: "right", color: g.margin < 0 ? "var(--bad-fg)" : undefined }}>
        {money(g.margin)}
        {g.pct !== null && ` · ${g.pct}%`}
      </span>
      <span className="muted" style={{ gridColumn: "1 / -1" }}>
        {g.boxes} cx · {kgText(g.weightKg)} · vendeu {money(g.revenue)} · custou {money(g.cost)}
        {g.withoutCost > 0 && ` · ${g.withoutCost} cx sem custo`}
      </span>
    </div>
  );
}

/** Margem das vendas do período (por produto e por cliente) e valor do stock atual. */
export default function Margins({ orgId, from, to, label }: Props) {
  const [rows, setRows] = useState<MarginRow[] | null>(null);
  const [stock, setStock] = useState<Awaited<ReturnType<typeof stockValue>> | null>(null);
  const [by, setBy] = useState<"product" | "customer">("product");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    Promise.all([marginRows(orgId, from, to), stockValue(orgId)])
      .then(([m, s]) => {
        setRows(m);
        setStock(s);
      })
      .catch(e => setError(errorText(e)));
  }, [orgId, from, to]);

  const data = rows ? marginBy(rows, by) : null;

  return (
    <section className="panel" aria-label="Margem">
      <strong>Margem das vendas · {label}</strong>
      {error && <p className="note bad">{error}</p>}
      {!rows && !error && <p className="muted">Calculando…</p>}
      {data && rows!.length === 0 && <p className="muted">Nenhuma venda no período.</p>}
      {data && rows!.length > 0 && (
        <>
          <div className="row spread" style={{ fontWeight: 700, fontSize: 18 }}>
            <span>Margem</span>
            <span className="mono" style={{ color: data.total.margin < 0 ? "var(--bad-fg)" : undefined }}>
              {money(data.total.margin)}
              {data.total.pct !== null && ` · ${data.total.pct}%`}
            </span>
          </div>
          {data.total.withoutCost > 0 && (
            <p className="note warn" style={{ margin: 0 }}>
              {data.total.withoutCost} caixa{data.total.withoutCost === 1 ? "" : "s"} vendida
              {data.total.withoutCost === 1 ? "" : "s"} sem custo ficaram fora da conta. Lance o custo em Finanças → A
              pagar → Custo das entregas.
            </p>
          )}
          <div className="tabs" role="tablist" aria-label="Agrupar margem">
            <button
              role="tab"
              aria-selected={by === "product"}
              className={by === "product" ? "on" : ""}
              onClick={() => setBy("product")}
            >
              Por produto
            </button>
            <button
              role="tab"
              aria-selected={by === "customer"}
              className={by === "customer" ? "on" : ""}
              onClick={() => setBy("customer")}
            >
              Por cliente
            </button>
          </div>
          <div>
            {data.groups.map(g => (
              <Row key={g.key} g={g} />
            ))}
          </div>
        </>
      )}
      {stock && stock.boxes > 0 && (
        <dl>
          <div className="field">
            <dt>Valor do stock hoje (pelo custo)</dt>
            <dd>{money(stock.value)}</dd>
          </div>
          <div className="field">
            <dt>Caixas em stock sem custo</dt>
            <dd>
              {stock.boxes_without_cost} de {stock.boxes}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
