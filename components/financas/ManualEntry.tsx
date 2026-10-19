"use client";
import { useEffect, useState } from "react";
import type { Org } from "@/lib/offline-db";
import { ACCOUNT_TYPE, getBooksLock, listAccounts, postManualEntry, type Account } from "@/lib/finance";
import { checkEntry, isLocked, type EntryLineForm } from "@/lib/journal";
import { parseNumber } from "@/lib/products";
import { brDate, errorText, money } from "@/lib/sales";

type Props = { org: Org; go: (q: string) => void };

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const blank = (): EntryLineForm => ({ account_id: "", debit: "", credit: "" });

/** Lançamento manual: saldo inicial, aporte dos sócios, ajuste do contador. */
export default function ManualEntry({ org, go }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [date, setDate] = useState(todayIso());
  const [lock, setLock] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<EntryLineForm[]>([blank(), blank()]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    listAccounts(org.id)
      .then(a => setAccounts(a.filter(x => x.active)))
      .catch(e => setMsg(errorText(e)));
    getBooksLock(org.id)
      .then(setLock)
      .catch(() => setLock(null));
  }, [org.id]);

  const sum = (k: "debit" | "credit") =>
    lines.reduce((s, l) => {
      const v = parseNumber(l[k]);
      return s + (v && !Number.isNaN(v) ? Math.round(v * 100) : 0);
    }, 0) / 100;
  const dr = sum("debit");
  const cr = sum("credit");

  const setLine = (i: number, k: keyof EntryLineForm, v: string) =>
    setLines(ls => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isLocked(date, lock)) return setMsg(`O livro está fechado até ${brDate(lock)}. Escolha uma data depois disso.`);
    const c = checkEntry(description, lines);
    if (!c.ok) return setMsg(c.error);
    setBusy(true);
    setMsg(null);
    try {
      await postManualEntry(org.id, date, description.trim(), c.lines);
      go(`aba=livro&mes=${date.slice(0, 7)}`);
    } catch (err) {
      setMsg(errorText(err));
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row spread">
        <h2>Lançamento manual</h2>
        <button className="btn small" onClick={() => go("aba=livro")}>
          ← Livro
        </button>
      </div>
      <p className="note info">
        Use para saldo inicial do banco, aporte dos sócios ou ajuste pedido pelo contador. Vendas, compras e pagamentos
        já entram sozinhos. Só donos e admins podem lançar.
      </p>
      <form className="panel" onSubmit={submit}>
        <label>
          Data
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
        </label>
        {isLocked(date, lock) && (
          <p className="note warn" style={{ margin: 0 }}>
            Esta data está num mês fechado (livro fechado até {brDate(lock)}). Escolha uma data depois disso.
          </p>
        )}
        <label>
          Descrição
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Ex.: saldo inicial do banco em 01/11"
            required
          />
        </label>

        {lines.map((l, i) => (
          <fieldset
            key={i}
            style={{
              border: "1px solid var(--line)",
              borderRadius: 10,
              padding: 12,
              margin: 0,
              display: "grid",
              gap: 8,
            }}
          >
            <legend className="muted" style={{ padding: "0 4px" }}>
              Linha {i + 1}
            </legend>
            <select
              aria-label={`Conta da linha ${i + 1}`}
              value={l.account_id}
              onChange={e => setLine(i, "account_id", e.target.value)}
            >
              <option value="">Conta…</option>
              {(Object.keys(ACCOUNT_TYPE) as (keyof typeof ACCOUNT_TYPE)[]).map(t => (
                <optgroup key={t} label={ACCOUNT_TYPE[t]}>
                  {accounts
                    .filter(a => a.type === t)
                    .map(a => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <label style={{ flex: 1 }}>
                Débito (£)
                <input inputMode="decimal" value={l.debit} onChange={e => setLine(i, "debit", e.target.value)} />
              </label>
              <label style={{ flex: 1 }}>
                Crédito (£)
                <input inputMode="decimal" value={l.credit} onChange={e => setLine(i, "credit", e.target.value)} />
              </label>
            </div>
            {lines.length > 2 && (
              <button type="button" className="btn small" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}>
                Tirar linha
              </button>
            )}
          </fieldset>
        ))}

        <button type="button" className="btn" onClick={() => setLines(ls => [...ls, blank()])}>
          Adicionar linha
        </button>

        <dl>
          <div className="field">
            <dt>Débitos</dt>
            <dd>{money(dr)}</dd>
          </div>
          <div className="field">
            <dt>Créditos</dt>
            <dd>{money(cr)}</dd>
          </div>
        </dl>
        {dr !== cr && (
          <p className="note warn" style={{ margin: 0 }}>
            Diferença de {money(Math.abs(dr - cr))}: débitos e créditos precisam ser iguais.
          </p>
        )}

        <button className="btn primary" disabled={busy}>
          {busy ? "Lançando…" : "Lançar"}
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
