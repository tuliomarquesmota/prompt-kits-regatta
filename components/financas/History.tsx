"use client";
import { useEffect, useState } from "react";
import type { Org } from "@/lib/offline-db";
import { listAudit } from "@/lib/finance";
import { changeLines, describe, when, type AuditRow } from "@/lib/audit";
import { errorText } from "@/lib/sales";

type Props = { org: Org; go: (q: string) => void };

const PAGE = 50;

/** Histórico: quem criou, mudou ou apagou o quê. Mais recentes primeiro. */
export default function History({ org, go }: Props) {
  const [list, setList] = useState<AuditRow[] | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAudit(org.id, null, PAGE)
      .then(rows => {
        setList(rows);
        setMore(rows.length === PAGE);
      })
      .catch(e => setError(errorText(e)));
  }, [org.id]);

  async function loadMore() {
    if (!list?.length) return;
    setBusy(true);
    try {
      const rows = await listAudit(org.id, list[list.length - 1].id, PAGE);
      setList([...list, ...rows]);
      setMore(rows.length === PAGE);
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }

  return (
    <>
      <div className="row spread">
        <h1>Histórico</h1>
        <button className="btn small" onClick={() => go("aba=livro")}>
          ← Livro
        </button>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Quem criou, mudou ou apagou invoices, pagamentos, contas, produtos, preços, clientes, caixas e equipe. Ninguém
        consegue apagar este histórico.
      </p>

      {error && <p className="note bad">{error}</p>}
      {!list && !error && <p className="muted">Carregando histórico…</p>}
      {list && list.length === 0 && (
        <p className="muted">Nada registrado ainda. As próximas alterações aparecem aqui.</p>
      )}

      {list?.map(r => {
        const lines = changeLines(r);
        return (
          <section className="panel" key={r.id} style={{ gap: 4 }}>
            <strong>{describe(r)}</strong>
            <span className="muted">{when(r.changed_at)}</span>
            {r.note && <span>Motivo: {r.note}</span>}
            {lines.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {more && (
        <button className="btn" onClick={loadMore} disabled={busy}>
          {busy ? "Carregando…" : "Carregar mais"}
        </button>
      )}
    </>
  );
}
