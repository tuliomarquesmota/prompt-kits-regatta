"use client";
import { useState } from "react";
import { errorText, money, PAYMENT_METHODS } from "@/lib/sales";
import { numberText, parseNumber } from "@/lib/products";

/** Formulário de pagamento (recebido ou feito): valor, data, forma e observação. */
export default function PaymentForm({
  title,
  balance,
  save,
  onCancel,
  onDone,
}: {
  title: string;
  balance: number;
  save: (p: { amount: number; paid_on: string; method: string; note: string }) => Promise<void>;
  onCancel: () => void;
  onDone: () => void;
}) {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [amount, setAmount] = useState(numberText(balance.toFixed(2)));
  const [paidOn, setPaidOn] = useState(iso);
  const [method, setMethod] = useState("transferencia");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseNumber(amount);
    if (value === null || Number.isNaN(value) || value <= 0)
      return setMsg("Valor inválido. Use só números, ex.: 324,37");
    if (Math.round(value * 100) > Math.round(balance * 100))
      return setMsg(`O valor passa do saldo em aberto (${money(balance)}).`);
    setBusy(true);
    setMsg(null);
    try {
      await save({ amount: value, paid_on: paidOn, method, note });
      onDone();
    } catch (err) {
      setMsg(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit} aria-label={title}>
      <div className="row spread">
        <strong>{title}</strong>
        <button type="button" className="btn small" onClick={onCancel} disabled={busy}>
          Fechar
        </button>
      </div>
      <label>
        Valor (£)
        <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
      </label>
      <span className="muted">
        Saldo em aberto: {money(balance)}. Pode registrar um valor menor se o pagamento foi parcial.
      </span>
      <label>
        Data do pagamento
        <input type="date" value={paidOn} max={iso} onChange={e => setPaidOn(e.target.value)} />
      </label>
      <label>
        Forma de pagamento
        <select value={method} onChange={e => setMethod(e.target.value)}>
          {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        Observação (opcional)
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Ex.: referência do banco" />
      </label>
      <button className="btn primary" disabled={busy}>
        {busy ? "Registrando…" : "Registrar pagamento"}
      </button>
      {msg && (
        <p className="note bad" role="status">
          {msg}
        </p>
      )}
    </form>
  );
}
