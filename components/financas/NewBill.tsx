"use client";
import { useEffect, useMemo, useState } from "react";
import type { Org } from "@/lib/offline-db";
import { createBill, listAccounts, type Account } from "@/lib/finance";
import { listSuppliers, type Supplier } from "@/lib/registry";
import { checkBill, vatOf, type BillForm } from "@/lib/payables";
import { parseNumber, numberText } from "@/lib/products";
import { errorText, money } from "@/lib/sales";

type Props = { org: Org; go: (q: string) => void };

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function NewBill({ org, go }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState<BillForm>({
    supplier_id: "",
    payee: "",
    account_id: "",
    description: "",
    reference: "",
    issued_on: todayIso(),
    due_on: "",
    net: "",
    vat_rate: "20",
    vat_amount: "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listAccounts(org.id), listSuppliers(org.id)])
      .then(([a, s]) => {
        setAccounts(a.filter(x => x.active && x.type === "expense"));
        setSuppliers(s);
      })
      .catch(e => setMsg(errorText(e)));
  }, [org.id]);

  const set = (k: keyof BillForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  // VAT sugerido pela taxa enquanto a pessoa não digitar outro valor
  const suggested = useMemo(() => {
    const n = parseNumber(form.net);
    return n === null || Number.isNaN(n) ? null : vatOf(n, Number(form.vat_rate));
  }, [form.net, form.vat_rate]);
  const check = checkBill(form);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!check.ok) return setMsg(check.error);
    setBusy(true);
    setMsg(null);
    try {
      const id = await createBill(org.id, check.row);
      go(`aba=pagar&conta=${id}`);
    } catch (err) {
      setMsg(errorText(err));
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row spread">
        <h2>Nova conta</h2>
        <button className="btn small" onClick={() => go("aba=pagar")}>
          ← A pagar
        </button>
      </div>
      <form className="panel" onSubmit={submit}>
        <label>
          Fornecedor
          <select value={form.supplier_id} onChange={set("supplier_id")}>
            <option value="">Outro (digitar abaixo)</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {!form.supplier_id && (
          <label>
            Pagar para
            <input value={form.payee} onChange={set("payee")} placeholder="British Gas, transportadora, contador…" />
          </label>
        )}
        <label>
          Categoria
          <select value={form.account_id} onChange={set("account_id")} required>
            <option value="">Escolha…</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Descrição (opcional)
          <input value={form.description} onChange={set("description")} placeholder="Ex.: frete do container 12" />
        </label>
        <label>
          Número da conta / invoice do fornecedor (opcional)
          <input value={form.reference} onChange={set("reference")} autoCapitalize="characters" />
        </label>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <label style={{ flex: 1 }}>
            Data
            <input type="date" value={form.issued_on} onChange={set("issued_on")} required />
          </label>
          <label style={{ flex: 1 }}>
            Vencimento
            <input type="date" value={form.due_on} onChange={set("due_on")} />
          </label>
        </div>
        <label>
          Valor sem VAT (£)
          <input inputMode="decimal" value={form.net} onChange={set("net")} placeholder="1.250,00" required />
        </label>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <label style={{ flex: 1 }}>
            Taxa de VAT
            <select value={form.vat_rate} onChange={set("vat_rate")}>
              <option value="20">20%</option>
              <option value="5">5%</option>
              <option value="0">0% / sem VAT</option>
            </select>
          </label>
          <label style={{ flex: 1 }}>
            VAT (£)
            <input
              inputMode="decimal"
              value={form.vat_amount}
              onChange={set("vat_amount")}
              placeholder={suggested === null ? "" : numberText(suggested.toFixed(2))}
            />
          </label>
        </div>
        <span className="muted">
          O VAT é calculado pela taxa. Se a conta do fornecedor mostrar outro valor, digite o valor dela.
        </span>
        <div className="row spread" style={{ fontWeight: 700, fontSize: 18 }}>
          <span>Total</span>
          <span className="mono">{check.ok ? money(check.gross) : "—"}</span>
        </div>
        <button className="btn primary" disabled={busy}>
          {busy ? "Salvando…" : "Lançar conta"}
        </button>
        {msg && (
          <p className="note bad" role="status">
            {msg}
          </p>
        )}
      </form>
    </>
  );
}
