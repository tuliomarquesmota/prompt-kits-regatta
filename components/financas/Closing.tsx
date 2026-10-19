"use client";
import { useEffect, useState } from "react";
import type { Org } from "@/lib/offline-db";
import { closeBooks, getBooksLock, reopenBooks } from "@/lib/finance";
import { amAdmin } from "@/lib/registry";
import { monthLabel, monthRange, nextToClose, reopenTarget } from "@/lib/journal";
import { brDate, errorText } from "@/lib/sales";

type Props = { org: Org; go: (q: string) => void };

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Fechar o mês: depois de fechado, nada com data naquele mês muda. Reabrir pede motivo. */
export default function Closing({ org, go }: Props) {
  const [lock, setLock] = useState<string | null | undefined>(undefined);
  const [admin, setAdmin] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [reopen, setReopen] = useState<"" | "ultimo" | "tudo">("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  async function load() {
    try {
      setLock(await getBooksLock(org.id));
    } catch (e) {
      setMsg({ kind: "bad", text: errorText(e) });
    }
  }
  useEffect(() => {
    load();
    amAdmin(org.id).then(setAdmin);
  }, [org.id]);

  const next = lock === undefined ? null : nextToClose(lock, todayIso());

  async function doClose() {
    if (!next) return;
    setBusy(true);
    setMsg(null);
    try {
      await closeBooks(org.id, monthRange(next).to);
      setConfirm(false);
      setMsg({
        kind: "ok",
        text: `${monthLabel(next)} fechado. Nada com data até ${brDate(monthRange(next).to)} pode mudar.`,
      });
      await load();
    } catch (e) {
      setMsg({ kind: "bad", text: errorText(e) });
    }
    setBusy(false);
  }

  async function doReopen(e: React.FormEvent) {
    e.preventDefault();
    if (!lock || !reopen) return;
    if (!reason.trim()) return setMsg({ kind: "bad", text: "Escreva o motivo para reabrir." });
    setBusy(true);
    setMsg(null);
    try {
      const until = reopen === "tudo" ? null : reopenTarget(lock);
      await reopenBooks(org.id, until, reason.trim());
      setReopen("");
      setReason("");
      setMsg({
        kind: "ok",
        text: until ? `Reaberto. O livro agora está fechado até ${brDate(until)}.` : "Todos os meses foram reabertos.",
      });
      await load();
    } catch (err) {
      setMsg({ kind: "bad", text: errorText(err) });
    }
    setBusy(false);
  }

  return (
    <>
      <p className="note info">
        Fechar o mês trava o livro: invoices, pagamentos, contas e lançamentos com data naquele mês não podem mais ser
        criados, mudados nem apagados. Assim os números que foram para o contador e para o VAT não mudam sozinhos.
        Correções entram com data de hoje, por exemplo uma credit note.
      </p>

      {lock === undefined && !msg && <p className="muted">Carregando…</p>}
      {msg && <p className={`note ${msg.kind}`}>{msg.text}</p>}

      {lock !== undefined && (
        <section className="panel" aria-label="Situação do livro">
          <strong>{lock ? `Livro fechado até ${brDate(lock)}` : "Nenhum mês fechado ainda"}</strong>
          {lock && <span className="muted">Último mês fechado: {monthLabel(lock.slice(0, 7))}</span>}
        </section>
      )}

      {lock !== undefined && !admin && <p className="muted">Apenas donos e admins fecham ou reabrem o mês.</p>}

      {admin && lock !== undefined && !next && (
        <p className="muted">
          O próximo mês só pode ser fechado depois que terminar ({monthLabel(todayIso().slice(0, 7))} ainda está em
          andamento).
        </p>
      )}

      {admin && next && (
        <section className="panel" aria-label="Fechar o próximo mês">
          <strong>Fechar {monthLabel(next)}</strong>
          {!lock && <span className="muted">Os meses anteriores a {monthLabel(next)} também ficam fechados.</span>}
          <span>Antes de fechar, confira:</span>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>todas as invoices e credit notes do mês estão lançadas;</li>
            <li>as contas a pagar do mês estão lançadas;</li>
            <li>os pagamentos batem com o extrato do banco;</li>
            <li>o VAT em Relatórios está certo.</li>
          </ul>
          <button className="btn" onClick={() => go("aba=relatorios")}>
            Ver relatórios
          </button>
          {!confirm ? (
            <button className="btn primary" onClick={() => setConfirm(true)}>
              Fechar {monthLabel(next)}
            </button>
          ) : (
            <div className="panel" role="alertdialog" aria-labelledby="fecharTitulo">
              <strong id="fecharTitulo">
                Fechar {monthLabel(next)}? Nada com data até {brDate(monthRange(next).to)} poderá mudar.
              </strong>
              <div className="row">
                <button className="btn primary" style={{ flex: 1 }} onClick={doClose} disabled={busy}>
                  {busy ? "Fechando…" : "Sim, fechar"}
                </button>
                <button className="btn" style={{ flex: 1 }} onClick={() => setConfirm(false)} disabled={busy}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {admin && lock && (
        <form className="panel" onSubmit={doReopen} aria-label="Reabrir">
          <strong>Reabrir</strong>
          <span className="muted">Use só para corrigir um erro. O motivo fica registrado no histórico.</span>
          <div className="row">
            <button
              type="button"
              className={`btn ${reopen === "ultimo" ? "primary" : ""}`}
              style={{ flex: 1 }}
              onClick={() => setReopen("ultimo")}
            >
              Só {monthLabel(lock.slice(0, 7))}
            </button>
            <button
              type="button"
              className={`btn ${reopen === "tudo" ? "primary" : ""}`}
              style={{ flex: 1 }}
              onClick={() => setReopen("tudo")}
            >
              Todos os meses
            </button>
          </div>
          {reopen && (
            <>
              <label>
                Motivo
                <textarea
                  rows={2}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Ex.: invoice INV-0012 lançada com valor errado"
                  required
                />
              </label>
              <button className="btn primary" disabled={busy}>
                {busy ? "Reabrindo…" : "Reabrir"}
              </button>
            </>
          )}
        </form>
      )}
    </>
  );
}
