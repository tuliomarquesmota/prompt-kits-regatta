"use client";
import { useEffect, useMemo, useState } from "react";
import type { Org } from "@/lib/offline-db";
import { createOrder, customerPrices, errorText, listCustomers, listProducts, money, type Customer } from "@/lib/sales";

type Props = { org: Org; go: (q: string) => void };
type Line = { key: number; product_id: string; boxes: string; price: string };

let nextKey = 1;
const newLine = (): Line => ({ key: nextKey++, product_id: "", boxes: "1", price: "" });
const num = (s: string) => Number(s.replace(",", "."));

export default function NewOrder({ org, go }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [delivery, setDelivery] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listCustomers(org.id), listProducts(org.id)])
      .then(([c, p]) => {
        setCustomers(c);
        setProducts(p);
      })
      .catch(e => setError(errorText(e)));
  }, [org.id]);

  // Ao escolher o cliente, traz o último preço por kg de cada produto
  useEffect(() => {
    if (!customerId) return setPrices({});
    customerPrices(customerId)
      .then(p => {
        setPrices(p);
        setLines(ls =>
          ls.map(l => (l.product_id && !l.price && p[l.product_id] ? { ...l, price: String(p[l.product_id]) } : l)),
        );
      })
      .catch(() => setPrices({}));
  }, [customerId]);

  const update = (key: number, patch: Partial<Line>) =>
    setLines(ls =>
      ls.map(l => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (patch.product_id && !l.price && prices[patch.product_id]) next.price = String(prices[patch.product_id]);
        return next;
      }),
    );

  const valid = useMemo(
    () =>
      !!customerId &&
      lines.length > 0 &&
      lines.every(
        l => l.product_id && num(l.boxes) > 0 && Number.isInteger(num(l.boxes)) && num(l.price) >= 0 && l.price !== "",
      ),
    [customerId, lines],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return setError("Escolha o cliente e preencha produto, caixas e preço por kg em todas as linhas.");
    setBusy(true);
    setError(null);
    try {
      const id = await createOrder(
        org.id,
        customerId,
        lines.map(l => ({ product_id: l.product_id, boxes: num(l.boxes), price_kg: num(l.price) })),
        delivery || null,
      );
      go(`pedido=${id}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row spread">
        <h1>Novo pedido</h1>
        <button className="btn small" onClick={() => go("")}>
          ← Pedidos
        </button>
      </div>

      {customers.length === 0 && products.length > 0 && (
        <p className="note info">
          Nenhum cliente cadastrado.{" "}
          <button className="btn small" onClick={() => go("clientes")}>
            Cadastrar cliente
          </button>
        </p>
      )}

      <form className="panel" onSubmit={submit}>
        <label>
          Cliente
          <select id="orderCustomer" value={customerId} onChange={e => setCustomerId(e.target.value)} required>
            <option value="">Escolha o cliente</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Data de entrega (opcional)
          <input id="orderDelivery" type="date" value={delivery} onChange={e => setDelivery(e.target.value)} />
        </label>

        {lines.map((l, i) => (
          <fieldset
            key={l.key}
            style={{
              border: "1px solid var(--line)",
              borderRadius: 10,
              padding: 12,
              display: "grid",
              gap: 10,
              margin: 0,
            }}
          >
            <legend className="muted" style={{ padding: "0 6px" }}>
              Produto {i + 1}
            </legend>
            <label>
              Produto
              <select
                id={`p-${l.key}`}
                value={l.product_id}
                onChange={e => update(l.key, { product_id: e.target.value })}
              >
                <option value="">Escolha</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <label>
                Caixas
                <input
                  id={`b-${l.key}`}
                  inputMode="numeric"
                  value={l.boxes}
                  onChange={e => update(l.key, { boxes: e.target.value })}
                />
              </label>
              <label>
                Preço £/kg
                <input
                  id={`r-${l.key}`}
                  inputMode="decimal"
                  value={l.price}
                  onChange={e => update(l.key, { price: e.target.value })}
                  placeholder="14,90"
                />
              </label>
            </div>
            {l.product_id && prices[l.product_id] !== undefined && (
              <span className="muted">Último preço para este cliente: {money(prices[l.product_id])}/kg</span>
            )}
            {lines.length > 1 && (
              <button
                type="button"
                className="btn small"
                onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))}
              >
                Tirar este produto
              </button>
            )}
          </fieldset>
        ))}

        <button type="button" className="btn" onClick={() => setLines(ls => [...ls, newLine()])}>
          + Adicionar produto
        </button>
        <p className="muted" style={{ margin: 0 }}>
          O valor final sai na expedição, pelo peso real de cada caixa bipada.
        </p>
        <button className="btn primary" disabled={busy}>
          Criar pedido
        </button>
      </form>

      {error && <p className="note bad">{error}</p>}
    </>
  );
}
