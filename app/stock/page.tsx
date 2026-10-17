"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { supabase } from "@/lib/supabase";
import { currentOrg } from "@/lib/org";
import type { Org } from "@/lib/offline-db";
import { fefo, matches, summarize, type BoxState, type StockBox, type StockProduct } from "@/lib/stock";

type Snapshot = { at: string; products: StockProduct[]; boxes: StockBox[] };

const PAGE = 1000; // o Supabase devolve no máximo 1000 linhas por consulta
const cacheKey = (orgId: string) => `lote-stock-${orgId}`;

const kg = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kg";
const br = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

const STATE: Record<BoxState, { text: (d: number | null) => string; tone: string }> = {
  "sai-primeiro": { text: () => "Sai primeiro", tone: "info" },
  ok: { text: d => (d === null ? "Sem validade" : `${d} dias`), tone: "ok" },
  "vence-logo": { text: d => (d === 0 ? "Vence hoje" : `Vence em ${d} dias`), tone: "warn" },
  vencida: { text: () => "Vencida · não vender", tone: "bad" },
  bloqueada: { text: () => "Bloqueada", tone: "bad" },
  reservada: { text: () => "Reservada", tone: "info" },
};

async function fetchSnapshot(org: Org): Promise<Snapshot> {
  const sb = supabase();
  const { data: prods, error: pErr } = await sb
    .from("products")
    .select("id, name, suppliers(name)")
    .eq("org_id", org.id)
    .order("name");
  if (pErr) throw pErr;

  const boxes: StockBox[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("boxes")
      .select("id, product_id, net_weight_kg, lot, use_by, status, serial, locations(name)")
      .eq("org_id", org.id)
      .in("status", ["in_stock", "reserved", "blocked"])
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const b of data ?? []) {
      const loc = b.locations as unknown as { name: string } | null;
      boxes.push({
        id: b.id,
        product_id: b.product_id,
        net_weight_kg: b.net_weight_kg,
        lot: b.lot,
        use_by: b.use_by,
        status: b.status,
        serial: b.serial,
        location: loc?.name ?? null,
      });
    }
    if (!data || data.length < PAGE) break;
  }

  const products: StockProduct[] = (prods ?? []).map(p => {
    const sup = p.suppliers as unknown as { name: string } | null;
    return { id: p.id, name: p.name, supplier: sup?.name ?? null };
  });
  return { at: new Date().toISOString(), products, boxes };
}

export default function StockPage() {
  const router = useRouter();
  const [org, setOrg] = useState<Org | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (o: Org) => {
    setLoading(true);
    setError(null);
    try {
      const s = await fetchSnapshot(o);
      setSnap(s);
      try {
        localStorage.setItem(cacheKey(o.id), JSON.stringify(s));
      } catch {
        /* sem espaço no aparelho: segue sem cópia offline */
      }
    } catch {
      setError(
        navigator.onLine
          ? "Não consegui atualizar o stock. Tente de novo."
          : "Sem internet: mostrando o último stock salvo neste celular.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const o = currentOrg();
    supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (!data.session || !o) return router.replace("/login");
        setOrg(o);
        try {
          const cached = localStorage.getItem(cacheKey(o.id));
          if (cached) setSnap(JSON.parse(cached));
        } catch {
          /* sem cópia salva */
        }
        load(o);
      });
  }, [router, load]);

  const today = useMemo(() => new Date(), []);
  const summary = useMemo(() => (snap ? summarize(snap.products, snap.boxes, today) : []), [snap, today]);
  const visible = useMemo(
    () => (snap ? summary.filter(p => matches(p, snap.boxes, query)) : []),
    [summary, snap, query],
  );
  const totals = useMemo(
    () => ({
      boxes: summary.reduce((s, p) => s + p.available, 0),
      kg: summary.reduce((s, p) => s + p.availableKg, 0),
      soon: summary.reduce((s, p) => s + p.expiringSoon, 0),
      blocked: summary.reduce((s, p) => s + p.blocked, 0),
    }),
    [summary],
  );

  const open = openId ? summary.find(p => p.id === openId) : null;
  const openBoxes = useMemo(
    () =>
      open && snap
        ? fefo(
            snap.boxes.filter(b => b.product_id === open.id),
            today,
          )
        : [],
    [open, snap, today],
  );
  const updated = snap ? new Date(snap.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <main>
      <Nav />
      <div className="row spread">
        <div>
          <h1>Stock</h1>
          <div className="muted">
            {org?.name ?? "…"}
            {updated && ` · atualizado às ${updated}`}
          </div>
        </div>
        <button className="btn small" onClick={() => org && load(org)} disabled={loading || !org}>
          {loading ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      {error && <p className="note warn">{error}</p>}

      {!open && (
        <>
          <section className="panel" aria-label="Resumo">
            <div className="row spread">
              <div>
                <div className="muted">Disponível para venda</div>
                <div className="kg" style={{ fontSize: 28 }}>
                  {kg(totals.kg)}
                </div>
                <div className="muted">{totals.boxes} caixas</div>
              </div>
              <div className="chips" style={{ justifyContent: "flex-end" }}>
                {totals.soon > 0 && <span className="pill warn">{totals.soon} vencem em até 14 dias</span>}
                {totals.blocked > 0 && <span className="pill bad">{totals.blocked} vencidas ou bloqueadas</span>}
              </div>
            </div>
            <label>
              Buscar
              <input
                id="stockSearch"
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Produto, fornecedor, lote ou número da caixa"
              />
            </label>
          </section>

          <section className="panel" aria-label="Produtos">
            {!snap && loading && <p className="muted">Carregando o stock…</p>}
            {snap && summary.every(p => p.available === 0 && p.blocked === 0) && (
              <p className="muted">Nenhuma caixa no stock ainda. As caixas aparecem aqui assim que forem recebidas.</p>
            )}
            {snap && visible.length === 0 && query && <p className="muted">Nada encontrado para “{query}”.</p>}
            <div>
              {visible.map(p => (
                <button key={p.id} className="prod" onClick={() => setOpenId(p.id)}>
                  <span>
                    <strong>{p.name}</strong>
                    <span className="muted" style={{ display: "block" }}>
                      {p.supplier ?? "Fornecedor não informado"}
                    </span>
                  </span>
                  <span className="mono" style={{ textAlign: "right" }}>
                    {kg(p.availableKg)}
                    <span className="muted" style={{ display: "block" }}>
                      {p.available} cx
                    </span>
                  </span>
                  <span className="chips" style={{ gridColumn: "1 / -1" }}>
                    {p.nextUseBy && <span className="pill ok">Próxima validade {br(p.nextUseBy)}</span>}
                    {p.expiringSoon > 0 && <span className="pill warn">{p.expiringSoon} vencem logo</span>}
                    {p.blocked > 0 && <span className="pill bad">{p.blocked} bloqueadas</span>}
                    {p.available === 0 && p.blocked === 0 && <span className="pill info">Sem stock</span>}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {open && (
        <section className="panel" aria-label={`Caixas de ${open.name}`}>
          <div className="row spread">
            <button className="btn small" onClick={() => setOpenId(null)}>
              ← Produtos
            </button>
            <span className="mono">
              {open.available} cx · {kg(open.availableKg)}
            </span>
          </div>
          <div>
            <h1 style={{ fontSize: 22 }}>{open.name}</h1>
            <div className="muted">
              {open.supplier ?? "Fornecedor não informado"} · ordem de saída: vence primeiro, sai primeiro
            </div>
          </div>
          {openBoxes.length === 0 && <p className="muted">Nenhuma caixa deste produto no stock.</p>}
          <div>
            {openBoxes.map(b => {
              const st = STATE[b.state];
              return (
                <div className="item" key={b.id}>
                  <div>
                    <span className={`pill ${st.tone}`}>{st.text(b.days)}</span>
                  </div>
                  <div className="mono" style={{ textAlign: "right", fontWeight: 600 }}>
                    {kg(b.kg)}
                  </div>
                  <div className="muted">
                    Validade {br(b.use_by)} · Lote {b.lot ?? "—"}
                  </div>
                  <div className="muted" style={{ textAlign: "right" }}>
                    {b.location ?? "Sem local"}
                  </div>
                  {b.serial && (
                    <div className="muted mono" style={{ gridColumn: "1 / -1", fontSize: 12 }}>
                      Caixa {b.serial}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
