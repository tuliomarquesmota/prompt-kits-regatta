"use client";
import { useCallback, useEffect, useState } from "react";
import type { Org } from "@/lib/offline-db";
import { errorText, listCustomers, money, saveCustomer, type Customer } from "@/lib/sales";
import { numberText, parseNumber } from "@/lib/products";

type Props = { org: Org; go: (q: string) => void };

export default function Customers({ org, go }: Props) {
  const [list, setList] = useState<Customer[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [terms, setTerms] = useState("30");
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: string } | null>(null);

  const load = useCallback(() => {
    listCustomers(org.id)
      .then(setList)
      .catch(e => setMsg({ text: errorText(e), tone: "bad" }));
  }, [org.id]);
  useEffect(load, [load]);

  function reset() {
    setEditing(null);
    setName("");
    setEmail("");
    setAddress("");
    setTerms("30");
    setLimit("");
  }

  function startEdit(c: Customer) {
    setEditing(c.id);
    setName(c.name);
    setEmail(c.email ?? "");
    setAddress(c.address ?? "");
    setTerms(String(c.payment_terms));
    setLimit(numberText(c.credit_limit));
    setMsg(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const credit = parseNumber(limit);
    if (Number.isNaN(credit))
      return setMsg({ text: "Limite de crédito inválido. Use só números, ex.: 5000", tone: "bad" });
    setBusy(true);
    setMsg(null);
    try {
      await saveCustomer(org.id, editing, {
        name: name.trim(),
        email: email.trim() || null,
        address: address.trim() || null,
        payment_terms: Math.max(0, Number(terms) || 0),
        credit_limit: credit === null ? null : Math.round(credit * 100) / 100,
      });
      setMsg({ text: `${name.trim()} ${editing ? "atualizado" : "cadastrado"}.`, tone: "ok" });
      reset();
      load();
    } catch (err) {
      setMsg({ text: errorText(err), tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="panel" onSubmit={submit}>
        <strong>{editing ? "Editar cliente" : "Novo cliente"}</strong>
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
          Endereço (aparece na invoice)
          <textarea
            id="custAddress"
            rows={3}
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder={"1 High Street\nLondon\nE1 1AA"}
          />
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
        <label>
          Limite de crédito em £ (opcional)
          <input id="custLimit" inputMode="decimal" value={limit} onChange={e => setLimit(e.target.value)} />
        </label>
        <div className="row">
          <button className="btn primary" disabled={busy} style={{ flex: 1 }}>
            {editing ? "Salvar" : "Cadastrar cliente"}
          </button>
          {editing && (
            <button type="button" className="btn" onClick={reset}>
              Cancelar
            </button>
          )}
        </div>
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
                {c.address ? c.address.split("\n")[0] + " · " : ""}
                {c.email ?? "Sem email"}
                {c.credit_limit !== null && ` · limite ${money(Number(c.credit_limit))}`}
              </span>
              <div style={{ gridColumn: "1 / -1", marginTop: 6 }}>
                <button className="btn small" onClick={() => startEdit(c)} disabled={busy}>
                  Editar
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
