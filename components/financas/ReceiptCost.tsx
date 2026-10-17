"use client";
import { useEffect, useMemo, useState } from "react";
import type { Org } from "@/lib/offline-db";
import { getReceipt, saveReceiptCosts, type ReceiptProductRow } from "@/lib/finance";
import { landedCosts } from "@/lib/costing";
import { numberText, parseNumber } from "@/lib/products";
import { brDate, errorText, kgText, money } from "@/lib/sales";

type Props = { org: Org; receiptId: string; go: (q: string) => void };

/** Lançar o custo de uma entrega: preço por kg de cada produto + custos extras rateados por kg. */
export default function ReceiptCost({ receiptId, go }: Props) {
  const [rows, setRows] = useState<ReceiptProductRow[] | null>(null);
  const [date, setDate] = useState("");
  const [reference, setReference] = useState("");
  const [extras, setExtras] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: string } | null>(null);

  useEffect(() => {
    getReceipt(receiptId)
      .then(({ summary, rows }) => {
        setRows(rows);
        setDate(summary.received_at);
        setReference(summary.reference ?? "");
        setExtras(summary.extra_costs ? numberText(summary.extra_costs) : "");
        setPrices(Object.fromEntries(rows.map(r => [r.product_id, r.price_kg === null ? "" : numberText(r.price_kg)])));
      })
      .catch(e => setMsg({ text: errorText(e), tone: "bad" }));
  }, [receiptId]);

  const parsedPrices = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(prices).map(([k, v]) => {
          const n = parseNumber(v);
          return [k, n === null || Number.isNaN(n) ? null : n];
        }),
      ),
    [prices],
  );
  const extrasValue = parseNumber(extras);
  const preview = rows
    ? landedCosts(rows, parsedPrices, extrasValue && !Number.isNaN(extrasValue) ? extrasValue : 0)
    : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rows) return;
    if (extrasValue !== null && Number.isNaN(extrasValue))
      return setMsg({ text: "Custos extras inválidos. Use só números, ex.: 1.250,00", tone: "bad" });
    const bad = Object.entries(prices).find(([, v]) => v.trim() && Number.isNaN(parseNumber(v)));
    if (bad) return setMsg({ text: "Algum preço por kg está inválido. Use só números, ex.: 9,80", tone: "bad" });
    setBusy(true);
    setMsg(null);
    try {
      await saveReceiptCosts(
        receiptId,
        Object.entries(parsedPrices)
          .filter(([, v]) => v !== null)
          .map(([product_id, price_kg]) => ({ product_id, price_kg: price_kg as number })),
        extrasValue ?? 0,
        reference,
      );
      setMsg({ text: "Custo salvo. As caixas desta entrega já têm custo por kg.", tone: "ok" });
    } catch (err) {
      setMsg({ text: errorText(err), tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row spread">
        <div>
          <h1>Custo da entrega</h1>
          {date && <div className="muted">Recebida em {brDate(date)}</div>}
        </div>
        <button className="btn small" onClick={() => go("aba=pagar&ver=entregas")}>
          ← Entregas
        </button>
      </div>

      {!rows && !msg && <p className="muted">Carregando…</p>}

      {rows && preview && (
        <form className="panel" onSubmit={submit}>
          <label>
            Referência (opcional)
            <input
              value={reference}
              onChange={e => setReference(e.target.value)}
              placeholder="Ex.: container MSCU1234567"
            />
          </label>

          {rows.map(r => {
            const line = preview.lines.find(l => l.product_id === r.product_id);
            return (
              <div key={r.product_id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                <div className="row spread">
                  <strong>{r.product}</strong>
                  <span className="muted">
                    {r.boxes} cx · {kgText(r.weight_kg)}
                  </span>
                </div>
                <label style={{ marginTop: 6 }}>
                  Preço do fornecedor por kg (£)
                  <input
                    inputMode="decimal"
                    value={prices[r.product_id] ?? ""}
                    onChange={e => setPrices(p => ({ ...p, [r.product_id]: e.target.value }))}
                    placeholder="9,80"
                  />
                </label>
                {line?.cost_kg !== null && line?.cost_kg !== undefined && (
                  <div className="muted" style={{ marginTop: 4 }}>
                    Custo final {money(line.cost_kg)}/kg · {money(line.cost ?? 0)} no total
                  </div>
                )}
              </div>
            );
          })}

          <label style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            Custos extras da entrega (£, sem VAT)
            <input
              inputMode="decimal"
              value={extras}
              onChange={e => setExtras(e.target.value)}
              placeholder="Frete + porto + inspeção"
            />
          </label>
          <span className="muted">
            Rateado por kg: {money(preview.extraKg)} por kg em {kgText(preview.totalKg)}.
          </span>

          <div className="row spread" style={{ fontWeight: 700, fontSize: 18 }}>
            <span>Custo total da entrega</span>
            <span className="mono">{money(preview.total)}</span>
          </div>
          {preview.missing > 0 && (
            <p className="note warn" style={{ margin: 0 }}>
              {preview.missing} produto{preview.missing === 1 ? "" : "s"} sem preço: as caixas dele ficam sem custo e
              fora da margem.
            </p>
          )}
          <button className="btn primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar custo"}
          </button>
        </form>
      )}

      {msg && (
        <p className={`note ${msg.tone}`} role="status">
          {msg.text}
        </p>
      )}
    </>
  );
}
