"use client";
import { useEffect, useState } from "react";
import type { Org } from "@/lib/offline-db";
import { brDate, errorText, listOrders, money, ORDER_STATUS, type OrderSummary } from "@/lib/sales";

type Props = { org: Org; go: (q: string) => void };

export default function OrdersList({ org, go }: Props) {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"abertos" | "todos">("abertos");

  useEffect(() => {
    listOrders(org.id)
      .then(setOrders)
      .catch(e => setError(errorText(e)));
  }, [org.id]);

  const open = (o: OrderSummary) => o.status === "confirmed" || o.status === "picking";
  const shown = (orders ?? []).filter(o => filter === "todos" || open(o));
  const toShip = (orders ?? []).filter(open).length;

  return (
    <>
      <div className="row spread">
        <div>
          <h1>Vendas</h1>
          <div className="muted">{org.name}</div>
        </div>
        <div className="row">
          <button className="btn small" onClick={() => go("receber")}>
            A receber
          </button>
          <button className="btn small" onClick={() => go("clientes")}>
            Clientes
          </button>
        </div>
      </div>

      <button className="btn primary" onClick={() => go("novo")}>
        Novo pedido
      </button>

      {error && <p className="note bad">{error}</p>}

      <section className="panel">
        <div className="row spread">
          <strong>{filter === "abertos" ? `A expedir (${toShip})` : "Todos os pedidos"}</strong>
          <button className="btn small" onClick={() => setFilter(filter === "abertos" ? "todos" : "abertos")}>
            {filter === "abertos" ? "Ver todos" : "Só a expedir"}
          </button>
        </div>
        {!orders && !error && <p className="muted">Carregando pedidos…</p>}
        {orders && shown.length === 0 && (
          <p className="muted">
            {filter === "abertos"
              ? "Nenhum pedido esperando expedição. Toque em “Novo pedido” para criar um."
              : "Nenhum pedido ainda."}
          </p>
        )}
        <div>
          {shown.map(o => {
            const st = ORDER_STATUS[o.status];
            const target = o.invoice ? `invoice=${o.invoice.id}` : `pedido=${o.id}`;
            return (
              <button key={o.id} className="prod" onClick={() => go(target)}>
                <span>
                  <strong>{o.customer}</strong>
                  <span className="muted" style={{ display: "block" }}>
                    {o.number} · {brDate(o.created_at)}
                    {o.delivery_on && ` · entrega ${brDate(o.delivery_on)}`}
                  </span>
                </span>
                <span style={{ textAlign: "right" }}>
                  <span className={`pill ${st.tone}`}>{st.text}</span>
                  {o.invoice && (
                    <span className="mono muted" style={{ display: "block", marginTop: 4 }}>
                      {money(o.invoice.total)}
                    </span>
                  )}
                </span>
                <span className="muted" style={{ gridColumn: "1 / -1" }}>
                  {o.items}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
