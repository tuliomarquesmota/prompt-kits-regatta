"use client";
import { useCallback, useEffect, useState } from "react";
import type { Org } from "@/lib/offline-db";
import { addCustomer, errorText, listCustomers, type Customer } from "@/lib/sales";

type Props = { org: Org; go: (q: string) => void };

export default function Customers({ org, go }: Props) {
  const [list, setList] = useState<Customer[] | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [terms, setTerms] = useState("30");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: string } | null>(null);

  const load = useCallback(() => {
    listCustomers(org.id)
      .then(setList)
      .catch(e => setMsg({ text: errorText(e), tone: "bad" }));
  }, [org.id]);
  useEffect(load, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await addCustomer(org.id, {
        name: name.trim(),
        email: email.trim() || null,
        payment_terms: Math.max(0, Number(terms) || 0),
      });
      setMsg({ text: `${name.trim()} cadastrado.`, tone: "ok" });
      setName("");
      setEmail("");
      setTerms("30");
      load();
    } catch (err) {
      setMsg({ text: errorText(err), tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row spread">
        <h1>Clientes</h1>
        <button className="btn small" onClick={() => go("")}>
          ← Pedidos
        </button>
      </div>

      <form className="panel" onSubmit={submit}>
        <strong>Novo cliente</strong>
        <label>
          Nome
          <input
            id="custName"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="The Butcher's Block"
          />
        </label>
        <label>
          Email para invoices (opcional)
          <input id="custEmail" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        <label>
          Prazo de pagamento (dias)
          <input
            id="custTerms"
            type="number"
            inputMode="numeric"
            min={0}
            value={terms}
            onChange={e => setTerms(e.target.value)}
          />
        </label>
        <button className="btn primary" disabled={busy}>
          Cadastrar cliente
        </button>
      </form>

      {msg && <p className={`note ${msg.tone}`}>{msg.text}</p>}

      <section className="panel">
        <strong>Clientes ({list?.length ?? 0})</strong>
        {list && list.length === 0 && <p className="muted">Nenhum cliente ainda.</p>}
        <div>
          {list?.map(c => (
            <div className="item" key={c.id}>
              <strong>{c.name}</strong>
              <span className="muted">{c.payment_terms} dias</span>
              <span className="muted" style={{ gridColumn: "1 / -1" }}>
                {c.email ?? "Sem email"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
