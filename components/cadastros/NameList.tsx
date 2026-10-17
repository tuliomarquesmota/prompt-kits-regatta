"use client";
import { useCallback, useEffect, useState } from "react";

export type NamedItem = { id: string; name: string; extra?: string | null };

type Props = {
  title: string;
  /** Texto do botão e do campo, ex.: "fornecedor" */
  noun: string;
  placeholder: string;
  extraLabel?: string; // segundo campo opcional (ex.: país)
  extraPlaceholder?: string;
  empty: string;
  load: () => Promise<NamedItem[]>;
  save: (id: string | null, name: string, extra: string | null) => Promise<void>;
  remove: (id: string) => Promise<void>;
  errorText: (e: unknown) => string;
};

/** Lista simples de cadastro: adicionar, renomear e apagar. Usada para fornecedores e câmaras. */
export default function NameList(p: Props) {
  const [list, setList] = useState<NamedItem[] | null>(null);
  const [name, setName] = useState("");
  const [extra, setExtra] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: string } | null>(null);
  const { load: loadFn, errorText } = p;

  const load = useCallback(() => {
    loadFn()
      .then(setList)
      .catch(e => setMsg({ text: errorText(e), tone: "bad" }));
  }, [loadFn, errorText]);
  useEffect(load, [load]);

  function startEdit(i: NamedItem) {
    setEditing(i.id);
    setName(i.name);
    setExtra(i.extra ?? "");
    setConfirming(null);
    setMsg(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reset() {
    setEditing(null);
    setName("");
    setExtra("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setMsg(null);
    try {
      await p.save(editing, n, extra.trim() || null);
      setMsg({ text: editing ? `${n} atualizado.` : `${n} cadastrado.`, tone: "ok" });
      reset();
      load();
    } catch (err) {
      setMsg({ text: p.errorText(err), tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  async function remove(i: NamedItem) {
    if (confirming !== i.id) return setConfirming(i.id);
    setBusy(true);
    setMsg(null);
    try {
      await p.remove(i.id);
      setMsg({ text: `${i.name} apagado.`, tone: "ok" });
      if (editing === i.id) reset();
      load();
    } catch (err) {
      setMsg({ text: p.errorText(err), tone: "bad" });
    } finally {
      setConfirming(null);
      setBusy(false);
    }
  }

  return (
    <>
      <form className="panel" onSubmit={submit}>
        <strong>{editing ? `Editar ${p.noun}` : `Novo ${p.noun}`}</strong>
        <label>
          Nome
          <input required value={name} onChange={e => setName(e.target.value)} placeholder={p.placeholder} />
        </label>
        {p.extraLabel && (
          <label>
            {p.extraLabel}
            <input value={extra} onChange={e => setExtra(e.target.value)} placeholder={p.extraPlaceholder} />
          </label>
        )}
        <div className="row">
          <button className="btn primary" disabled={busy} style={{ flex: 1 }}>
            {editing ? "Salvar" : "Cadastrar"}
          </button>
          {editing && (
            <button type="button" className="btn" onClick={reset}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      {msg && (
        <p className={`note ${msg.tone}`} role="status">
          {msg.text}
        </p>
      )}

      <section className="panel">
        <strong>
          {p.title} ({list?.length ?? 0})
        </strong>
        {!list && !msg && <p className="muted">Carregando…</p>}
        {list && list.length === 0 && <p className="muted">{p.empty}</p>}
        <div>
          {list?.map(i => (
            <div className="item" key={i.id}>
              <strong>{i.name}</strong>
              <span className="muted">{i.extra ?? ""}</span>
              <div className="row" style={{ gridColumn: "1 / -1", marginTop: 6 }}>
                <button className="btn small" onClick={() => startEdit(i)} disabled={busy}>
                  Editar
                </button>
                <button className="btn small" onClick={() => remove(i)} disabled={busy}>
                  {confirming === i.id ? "Toque de novo para apagar" : "Apagar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
