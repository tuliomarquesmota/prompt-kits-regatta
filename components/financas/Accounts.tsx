"use client";
import { useCallback, useEffect, useState } from "react";
import type { Org } from "@/lib/offline-db";
import { ACCOUNT_TYPE, listAccounts, saveAccount, type Account, type AccountType } from "@/lib/finance";
import { errorText } from "@/lib/sales";

type Props = { org: Org };

const empty = { code: "", name: "", type: "expense" as AccountType, active: true };

/** Plano de contas: ver, renomear, criar e desativar contas. */
export default function Accounts({ org }: Props) {
  const [list, setList] = useState<Account[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: string } | null>(null);

  const load = useCallback(() => {
    listAccounts(org.id)
      .then(setList)
      .catch(e => setMsg({ text: errorText(e), tone: "bad" }));
  }, [org.id]);
  useEffect(load, [load]);

  function edit(a: Account) {
    setEditing(a.id);
    setForm({ code: a.code, name: a.name, type: a.type, active: a.active });
    setMsg(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await saveAccount(org.id, editing, { ...form, code: form.code.trim(), name: form.name.trim() });
      setMsg({ text: `${form.name.trim()} salva.`, tone: "ok" });
      setEditing(null);
      setForm(empty);
      load();
    } catch (err) {
      const code = (err as { code?: string }).code;
      setMsg({ text: code === "23505" ? "Já existe uma conta com este código." : errorText(err), tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  const system = list?.find(a => a.id === editing)?.system_key;

  return (
    <>
      <p className="note info">
        Plano de contas padrão do Reino Unido, simplificado. O contador pode renomear, criar e desativar contas. As
        contas marcadas como “automática” recebem os lançamentos do app e não podem ser desativadas.
      </p>
      <form className="panel" onSubmit={submit}>
        <strong>{editing ? "Editar conta" : "Nova conta"}</strong>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <label style={{ width: 110 }}>
            Código
            <input
              className="mono"
              inputMode="numeric"
              value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
              required
            />
          </label>
          <label style={{ flex: 1 }}>
            Nome
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </label>
        </div>
        <label>
          Tipo
          <select
            value={form.type}
            disabled={!!system}
            onChange={e => setForm(f => ({ ...f, type: e.target.value as AccountType }))}
          >
            {Object.entries(ACCOUNT_TYPE).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {editing && !system && (
          <label style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              checked={form.active}
              onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
              style={{ width: 24, minHeight: 24, height: 24 }}
            />
            Conta ativa (aparece nas opções)
          </label>
        )}
        <div className="row">
          <button className="btn primary" style={{ flex: 1 }} disabled={busy}>
            {editing ? "Salvar" : "Criar conta"}
          </button>
          {editing && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setEditing(null);
                setForm(empty);
              }}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>
      {msg && <p className={`note ${msg.tone}`}>{msg.text}</p>}

      {(Object.keys(ACCOUNT_TYPE) as AccountType[]).map(t => {
        const rows = (list ?? []).filter(a => a.type === t);
        if (!rows.length) return null;
        return (
          <section className="panel" key={t}>
            <strong>{ACCOUNT_TYPE[t]}</strong>
            <div>
              {rows.map(a => (
                <button key={a.id} className="prod" onClick={() => edit(a)} style={{ opacity: a.active ? 1 : 0.55 }}>
                  <span>
                    <span className="mono muted">{a.code}</span> <strong>{a.name}</strong>
                  </span>
                  <span>
                    {a.system_key && <span className="pill info">automática</span>}
                    {!a.active && <span className="pill">inativa</span>}
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
