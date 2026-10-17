"use client";
import { useEffect, useMemo, useState } from "react";
import { errorText, invoiceBoxes, kgText, money, returnBoxes } from "@/lib/sales";
import { creditPreview, type ShippedBox } from "@/lib/returns";

type Props = { invoiceId: string; onDone: () => void; onCancel: () => void };

/** Escolher as caixas devolvidas e gerar a credit note. */
export default function ReturnBoxes({ invoiceId, onDone, onCancel }: Props) {
  const [boxes, setBoxes] = useState<ShippedBox[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [restock, setRestock] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    invoiceBoxes(invoiceId)
      .then(setBoxes)
      .catch(e => setMsg(errorText(e)));
  }, [invoiceId]);

  const open = (boxes ?? []).filter(b => !b.returned);
  const picked = useMemo(() => (boxes ?? []).filter(b => chosen.has(b.id)), [boxes, chosen]);
  const prev = creditPreview(picked);

  function toggle(id: string) {
    setChosen(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function submit() {
    if (picked.length === 0) return setMsg("Escolha pelo menos uma caixa.");
    if (restock === null) return setMsg("Diga se as caixas voltam para o stock ou são descartadas.");
    setBusy(true);
    setMsg(null);
    try {
      await returnBoxes(
        invoiceId,
        picked.map(b => b.id),
        reason,
        restock,
      );
      onDone();
    } catch (e) {
      setMsg(errorText(e));
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-label="Devolução">
      <div className="row spread">
        <strong>Devolução</strong>
        <button className="btn small" onClick={onCancel} disabled={busy}>
          Fechar
        </button>
      </div>

      {!boxes && !msg && <p className="muted">Carregando caixas…</p>}
      {boxes && open.length === 0 && <p className="muted">Todas as caixas desta invoice já foram devolvidas.</p>}

      {open.length > 0 && (
        <>
          <span className="muted">Toque nas caixas que o cliente devolveu.</span>
          <div>
            {open.map(b => (
              <label
                key={b.id}
                className="item"
                style={{ flexDirection: "row", fontWeight: 400, cursor: "pointer", alignItems: "center" }}
              >
                <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={chosen.has(b.id)}
                    onChange={() => toggle(b.id)}
                    style={{ width: 24, minHeight: 24, height: 24 }}
                  />
                  <span>
                    <strong>{b.product_name}</strong>
                    <span className="muted" style={{ display: "block" }}>
                      Lote {b.lot ?? "—"} · caixa {b.serial ?? "—"}
                    </span>
                  </span>
                </span>
                <span className="mono">{kgText(b.net_weight_kg)}</span>
              </label>
            ))}
          </div>

          <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 8 }}>
            <legend style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>O que acontece com as caixas?</legend>
            <button
              type="button"
              className={`btn ${restock === true ? "primary" : ""}`}
              aria-pressed={restock === true}
              onClick={() => setRestock(true)}
            >
              Voltam para o stock
            </button>
            <button
              type="button"
              className={`btn ${restock === false ? "primary" : ""}`}
              aria-pressed={restock === false}
              onClick={() => setRestock(false)}
            >
              Descartar (não podem ser vendidas)
            </button>
          </fieldset>

          <label>
            Motivo (opcional)
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Vácuo perdido, pedido errado…"
            />
          </label>

          {picked.length > 0 && (
            <div>
              {prev.lines.map(l => (
                <div className="item" key={l.product_name + l.priceKg}>
                  <span>
                    {l.product_name} · {l.boxes} cx
                  </span>
                  <span className="mono">{money(l.amount)}</span>
                  <span className="muted" style={{ gridColumn: "1 / -1" }}>
                    {kgText(l.weightKg)} × {money(l.priceKg)}/kg
                  </span>
                </div>
              ))}
              <div className="row spread" style={{ fontWeight: 700, marginTop: 8 }}>
                <span>Credit note (sem VAT)</span>
                <span className="mono">− {money(prev.total)}</span>
              </div>
            </div>
          )}

          <button className="btn primary" onClick={submit} disabled={busy || picked.length === 0}>
            {busy
              ? "Gerando credit note…"
              : `Devolver ${picked.length} caixa${picked.length === 1 ? "" : "s"} e gerar credit note`}
          </button>
        </>
      )}

      {msg && (
        <p className="note bad" role="status">
          {msg}
        </p>
      )}
    </section>
  );
}
