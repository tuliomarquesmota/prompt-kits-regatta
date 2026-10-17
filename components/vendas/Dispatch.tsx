"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Scanner from "@/components/Scanner";
import type { Org } from "@/lib/offline-db";
import type { LabelProfile } from "@/lib/labels";
import { readLabel } from "@/lib/labels";
import { getCatalog } from "@/lib/catalog";
import { fefo, type StockBox } from "@/lib/stock";
import { checkPick, isComplete, preview } from "@/lib/dispatch";
import {
  boxesForProducts,
  brDate,
  errorText,
  findBox,
  getOrder,
  kgText,
  money,
  ORDER_STATUS,
  shipOrder,
  type OrderDetail,
} from "@/lib/sales";

type Props = { orderId: string; org: Org; go: (q: string) => void };
type Msg = { text: string; tone: "ok" | "warn" | "bad" | "info" };

function beep(ok: boolean) {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = ok ? 1150 : 300;
    g.gain.value = 0.12;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + (ok ? 0.09 : 0.35));
    navigator.vibrate?.(ok ? 60 : [80, 60, 80]);
  } catch {
    /* som é opcional */
  }
}

export default function Dispatch({ orderId, org, go }: Props) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [stock, setStock] = useState<StockBox[]>([]);
  const [picked, setPicked] = useState<StockBox[]>([]);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const profiles = useRef<LabelProfile[]>([]);
  const pickedRef = useRef<StockBox[]>([]);
  pickedRef.current = picked;

  const load = useCallback(async () => {
    try {
      const o = await getOrder(orderId);
      setOrder(o);
      setStock(
        await boxesForProducts(
          org.id,
          o.lines.map(l => l.product_id),
        ),
      );
      const cat = await getCatalog(org, navigator.onLine);
      profiles.current = cat?.profiles ?? [];
    } catch (e) {
      setMsg({ text: errorText(e), tone: "bad" });
    }
  }, [orderId, org]);
  useEffect(() => {
    load();
  }, [load]);

  const add = useCallback(
    (box: StockBox) => {
      if (!order) return;
      const r = checkPick(order.lines, pickedRef.current, box);
      if (!r.ok) {
        beep(false);
        return setMsg({ text: r.reason, tone: "bad" });
      }
      beep(true);
      setPicked(p => [...p, box]);
      const name = order.lines.find(l => l.product_id === box.product_id)?.product_name ?? "Caixa";
      setMsg(
        r.over
          ? {
              text: `${name} · ${kgText(Number(box.net_weight_kg))} adicionada, acima da quantidade pedida.`,
              tone: "warn",
            }
          : { text: `${name} · ${kgText(Number(box.net_weight_kg))} adicionada.`, tone: "ok" },
      );
    },
    [order],
  );

  const onCodes = useCallback(
    async (codes: string[]) => {
      const reading = readLabel(codes, profiles.current);
      if (!reading) {
        beep(false);
        return setMsg({ text: "Código não reconhecido. Confira se é a etiqueta do frigorífico.", tone: "bad" });
      }
      if (!reading.serial) {
        beep(false);
        return setMsg({
          text: "Este código não traz o número da caixa. Aponte para o outro código da etiqueta ou toque na caixa na lista abaixo.",
          tone: "warn",
        });
      }
      try {
        const box = await findBox(org.id, reading.productKey, reading.serial);
        if (!box) {
          beep(false);
          return setMsg({ text: "Esta caixa não está no sistema. Ela foi recebida pelo app?", tone: "bad" });
        }
        add(box);
      } catch (e) {
        setMsg({ text: errorText(e), tone: "bad" });
      }
    },
    [org.id, add],
  );

  const prev = useMemo(() => (order ? preview(order.lines, picked) : null), [order, picked]);
  const pickedIds = new Set(picked.map(p => p.id));

  async function confirm() {
    if (!order || picked.length === 0) return;
    if (!confirming && prev && !isComplete(prev)) return setConfirming(true);
    setBusy(true);
    setMsg(null);
    try {
      const invoiceId = await shipOrder(
        order.id,
        picked.map(p => p.id),
      );
      go(`invoice=${invoiceId}`);
    } catch (e) {
      setMsg({ text: errorText(e), tone: "bad" });
      setBusy(false);
      setConfirming(false);
      load();
    }
  }

  if (!order) {
    return (
      <>
        <button className="btn small" style={{ alignSelf: "flex-start" }} onClick={() => go("")}>
          ← Pedidos
        </button>
        {msg ? <p className={`note ${msg.tone}`}>{msg.text}</p> : <p className="muted">Carregando pedido…</p>}
      </>
    );
  }

  const open = order.status === "confirmed" || order.status === "picking";
  const st = ORDER_STATUS[order.status];

  return (
    <>
      <div className="row spread">
        <div>
          <h1>Expedição · {order.number}</h1>
          <div className="muted">{order.customer}</div>
        </div>
        <button className="btn small" onClick={() => go("")}>
          ← Pedidos
        </button>
      </div>

      {!open && (
        <p className="note info">
          Este pedido está como <span className={`pill ${st.tone}`}>{st.text}</span> e não pode mais ser expedido.
        </p>
      )}

      {open && (
        <section className="panel">
          <strong>Bipe cada caixa que sai</strong>
          <Scanner onCodes={onCodes} paused={busy} />
          {msg && (
            <p className={`note ${msg.tone}`} role="status">
              {msg.text}
            </p>
          )}
        </section>
      )}

      {prev && (
        <section className="panel" aria-label="Pedido">
          <strong>Pedido</strong>
          <div>
            {prev.lines.map(l => {
              const done = l.boxes >= l.requested;
              return (
                <div className="item" key={l.product_id}>
                  <div>
                    <strong>{l.product_name}</strong>{" "}
                    <span className={`pill ${done ? "ok" : "warn"}`}>
                      {l.boxes} de {l.requested} cx
                    </span>
                  </div>
                  <div className="mono" style={{ textAlign: "right" }}>
                    {money(l.amount)}
                  </div>
                  <div className="muted">
                    {kgText(l.weightKg)} × {money(l.priceKg)}/kg
                  </div>
                  <div className="muted" style={{ textAlign: "right" }}>
                    {l.lots.length > 0 ? `Lotes ${l.lots.join(", ")}` : ""}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="row spread" style={{ fontWeight: 700 }}>
            <span>Total (sem VAT)</span>
            <span className="mono">{money(prev.total)}</span>
          </div>
          {open && (
            <>
              {confirming && (
                <p className="note warn">
                  Faltam caixas em algum produto. Toque de novo para expedir assim mesmo; a invoice sai só com o que foi
                  bipado.
                </p>
              )}
              <button className="btn primary" onClick={confirm} disabled={busy || picked.length === 0}>
                {busy
                  ? "Expedindo…"
                  : `Expedir ${picked.length} caixa${picked.length === 1 ? "" : "s"} e gerar invoice`}
              </button>
            </>
          )}
        </section>
      )}

      {picked.length > 0 && open && (
        <section className="panel" aria-label="Caixas bipadas">
          <strong>Caixas bipadas ({picked.length})</strong>
          <div>
            {picked.map(b => (
              <div className="item" key={b.id}>
                <div>{order.lines.find(l => l.product_id === b.product_id)?.product_name}</div>
                <div className="mono" style={{ textAlign: "right" }}>
                  {kgText(Number(b.net_weight_kg))}
                </div>
                <div className="muted">
                  Lote {b.lot ?? "—"} · val. {brDate(b.use_by)}
                </div>
                <div style={{ textAlign: "right" }}>
                  <button className="btn small" onClick={() => setPicked(p => p.filter(x => x.id !== b.id))}>
                    Tirar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {open &&
        order.lines.map(l => {
          const list = fefo(stock.filter(b => b.product_id === l.product_id && !pickedIds.has(b.id))).filter(
            b => b.state === "sai-primeiro" || b.state === "ok" || b.state === "vence-logo",
          );
          return (
            <section className="panel" key={l.product_id} aria-label={`Separar ${l.product_name}`}>
              <div className="row spread">
                <strong>Separar · {l.product_name}</strong>
                <span className="muted">{list.length} em stock</span>
              </div>
              <span className="muted">
                Pegue nesta ordem (vence primeiro, sai primeiro). Toque para adicionar sem bipar.
              </span>
              {list.length === 0 && <p className="note warn">Sem caixas deste produto no stock.</p>}
              <div>
                {list.slice(0, 8).map(b => (
                  <button key={b.id} className="prod" onClick={() => add(b)}>
                    <span>
                      <span
                        className={`pill ${b.state === "vence-logo" ? "warn" : b.state === "sai-primeiro" ? "info" : "ok"}`}
                      >
                        {b.state === "sai-primeiro"
                          ? "Sai primeiro"
                          : b.days === null
                            ? "Sem validade"
                            : `${b.days} dias`}
                      </span>
                      <span className="muted" style={{ display: "block", marginTop: 4 }}>
                        Val. {brDate(b.use_by)} · Lote {b.lot ?? "—"} · {b.location ?? "Sem local"}
                      </span>
                    </span>
                    <span className="mono">{kgText(b.kg)}</span>
                  </button>
                ))}
              </div>
              {list.length > 8 && <span className="muted">e mais {list.length - 8} caixas</span>}
            </section>
          );
        })}
    </>
  );
}
