"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import Scanner from "@/components/Scanner";
import { supabase } from "@/lib/supabase";
import { getCatalog } from "@/lib/catalog";
import { currentOrg, setCurrentOrg } from "@/lib/org";
import { daysUntil, readLabel, serialFromSecondCode, type Reading } from "@/lib/labels";
import {
  listPending,
  listSent,
  queueBox,
  removePending,
  seenOnDevice,
  type Catalog,
  type PendingBox,
} from "@/lib/offline-db";
import { syncPending } from "@/lib/sync";

type Msg = { text: string; tone: "ok" | "warn" | "bad" | "info" };
type Row = PendingBox & { sentAt?: string };

const kg = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + " kg";
const br = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const newId = () => crypto.randomUUID();

function validity(useBy: string | null): { text: string; tone: Msg["tone"] } {
  const d = daysUntil(useBy);
  if (d == null) return { text: "Sem validade", tone: "warn" };
  if (d < 0) return { text: "Vencida · entra bloqueada", tone: "bad" };
  if (d <= 14) return { text: `Vence em ${d} dias`, tone: "warn" };
  return { text: `OK · ${d} dias`, tone: "ok" };
}

function beep(ok: boolean) {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(),
      g = ctx.createGain();
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

export default function ReceberPage() {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [receiptId, setReceiptId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");
  const [draft, setDraft] = useState<Reading | null>(null);
  const [typedUseBy, setTypedUseBy] = useState("");
  const [typedKg, setTypedKg] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);

  // ---------- início: sessão, empresa e catálogo (funciona offline com o que está salvo) ----------
  useEffect(() => {
    const org = currentOrg();
    setOnline(navigator.onLine);
    supabase()
      .auth.getSession()
      .then(async ({ data }) => {
        if (!data.session || !org) return router.replace("/login");
        const c = await getCatalog(org, navigator.onLine);
        if (!c)
          return setMsg({
            text: "Abra o app uma vez com internet para baixar os fornecedores e produtos.",
            tone: "bad",
          });
        setCatalog(c);
        setLocationId(prev => prev || (localStorage.getItem("lote-loc") ?? c.locations[0]?.id ?? ""));
      });
    setReceiptId(
      sessionStorage.getItem("lote-receipt") ??
        (() => {
          const id = newId();
          sessionStorage.setItem("lote-receipt", id);
          return id;
        })(),
    );
    const up = () => setOnline(true),
      down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [router]);

  const refresh = useCallback(async () => {
    if (!catalog || !receiptId) return;
    const pending = await listPending(catalog.org.id);
    const sent = await listSent(receiptId);
    setPendingCount(pending.filter(p => p.state === "pendente" || p.state === "erro").length);
    const mine = [...pending.filter(p => p.receiptId === receiptId), ...sent];
    mine.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    setRows(mine);
  }, [catalog, receiptId]);

  const sync = useCallback(async () => {
    if (!catalog || !navigator.onLine) return;
    const r = await syncPending(catalog);
    if (r.sent || r.duplicates || r.noProduct || r.errors)
      setLastSync(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    if (r.duplicates)
      setMsg({ text: `${r.duplicates} caixa(s) já estavam no stock, lidas por outro aparelho.`, tone: "warn" });
    await refresh();
  }, [catalog, refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (!online) return;
    sync();
    const t = setInterval(sync, 20000);
    return () => clearInterval(t);
  }, [online, sync]);

  // ---------- leitura ----------
  const isMolde = (r: Reading) => r.productKey.includes(":");
  const blocking = (r: Reading) =>
    r.missing.filter(m => m === "peso" || m === "validade" || (m === "serial" && isMolde(r)));

  async function commit(r: Reading) {
    if (!catalog) return;
    const product = catalog.products.find(p => p.gtin === r.productKey);
    await queueBox({
      id: newId(),
      orgId: catalog.org.id,
      receiptId,
      locationId: locationId || null,
      productId: product?.id ?? null,
      reading: r,
      state: "pendente",
      createdAt: new Date().toISOString(),
    });
    beep(true);
    setDraft(null);
    setTypedUseBy("");
    setTypedKg("");
    setMsg({
      text: `${product?.name ?? "Produto não cadastrado"} · ${kg(r.netWeightKg)} registrada${navigator.onLine ? "" : " (offline, envia quando conectar)"}.`,
      tone: product ? "ok" : "warn",
    });
    await refresh();
    if (navigator.onLine) sync();
  }

  async function onCodes(codes: string[]) {
    if (!catalog) return;
    // Segundo código que completa uma etiqueta aberta (ex.: número da caixa na Liffey)
    if (draft) {
      for (const c of codes) {
        const serial = serialFromSecondCode(c, draft);
        if (serial) {
          const next = { ...draft, serial, missing: draft.missing.filter(m => m !== "serial") };
          if (blocking(next).length === 0) return commit(next);
          setDraft(next);
          beep(true);
          return;
        }
      }
      return;
    }
    const r = readLabel(codes, catalog.profiles);
    if (!r) {
      beep(false);
      return setMsg({
        text: `Código não reconhecido: ${codes.join(" · ")}. Este fornecedor precisa de um perfil de etiqueta.`,
        tone: "bad",
      });
    }
    if (await seenOnDevice(r.productKey, r.serial)) {
      beep(false);
      return setMsg({ text: `Esta caixa já foi lida (serial ${r.serial}).`, tone: "warn" });
    }
    if (blocking(r).length === 0 && r.warnings.length === 0) return commit(r);
    beep(r.warnings.length === 0);
    setDraft(r);
  }

  function saveDraft() {
    if (!draft) return;
    const next: Reading = { ...draft, missing: [...draft.missing] };
    if (draft.missing.includes("validade")) {
      if (!typedUseBy) return setMsg({ text: "Digite a validade impressa na etiqueta.", tone: "bad" });
      next.useBy = typedUseBy;
      next.missing = next.missing.filter(m => m !== "validade");
    }
    if (draft.missing.includes("peso")) {
      const n = Number(typedKg.replace(",", "."));
      if (!n) return setMsg({ text: "Digite o peso líquido da etiqueta.", tone: "bad" });
      next.netWeightKg = n;
      next.missing = next.missing.filter(m => m !== "peso");
    }
    commit(next);
  }

  async function remove(id: string) {
    await removePending(id);
    refresh();
  }

  function newDelivery() {
    const id = newId();
    sessionStorage.setItem("lote-receipt", id);
    setReceiptId(id);
    setDraft(null);
    setMsg({ text: "Nova entrega iniciada.", tone: "info" });
  }

  const productName = (key: string, id: string | null) =>
    catalog?.products.find(p => p.id === id || p.gtin === key)?.name ?? "Produto não cadastrado";
  const totalKg = useMemo(
    () => rows.filter(r => r.state !== "duplicada").reduce((a, r) => a + (r.reading.netWeightKg ?? 0), 0),
    [rows],
  );

  // ---------- tela ----------
  return (
    <main>
      <Nav />
      <div className="row spread">
        <div>
          <h1>Recebimento</h1>
          <div className="muted">{catalog?.org.name ?? "…"}</div>
        </div>
        <div className="row">
          <span className={`pill ${online ? "ok" : "warn"}`}>{online ? "Online" : "Offline"}</span>
          {pendingCount > 0 && <span className="pill info">{pendingCount} aguardando envio</span>}
        </div>
      </div>

      <section className="panel">
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <label style={{ flex: 1 }}>
            Local
            <select
              id="loc"
              value={locationId}
              onChange={e => {
                setLocationId(e.target.value);
                localStorage.setItem("lote-loc", e.target.value);
              }}
            >
              <option value="">Sem local</option>
              {catalog?.locations.map(l => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Scanner onCodes={onCodes} paused={!catalog} />
        {msg && (
          <p className={`note ${msg.tone}`} role="status">
            {msg.text}
          </p>
        )}
      </section>

      {draft && (
        <section className="panel" aria-label="Caixa lida">
          <div className="row spread">
            <strong>{productName(draft.productKey, null)}</strong>
            <span className={`pill ${validity(draft.useBy).tone}`}>{validity(draft.useBy).text}</span>
          </div>
          <div className="muted">{draft.supplierName ?? "Fornecedor sem perfil"}</div>
          <div className="kg">{kg(draft.netWeightKg)}</div>
          <dl>
            <div className="field">
              <dt>Lote</dt>
              <dd>{draft.lot ?? "—"}</dd>
            </div>
            <div className="field">
              <dt>Validade</dt>
              <dd>{br(draft.useBy)}</dd>
            </div>
            <div className="field">
              <dt>Número da caixa</dt>
              <dd>{draft.serial ?? "—"}</dd>
            </div>
          </dl>
          {draft.warnings.map(w => (
            <p key={w} className="note warn">
              {w}
            </p>
          ))}
          {draft.missing.includes("serial") && isMolde(draft) && (
            <p className="note info">Aponte a câmera para o código menor da etiqueta para pegar o número da caixa.</p>
          )}
          {draft.missing.includes("peso") && (
            <label>
              Peso líquido (kg)
              <input id="kgIn" inputMode="decimal" value={typedKg} onChange={e => setTypedKg(e.target.value)} />
            </label>
          )}
          {draft.missing.includes("validade") && (
            <label>
              Validade impressa na etiqueta
              <input id="useByIn" type="date" value={typedUseBy} onChange={e => setTypedUseBy(e.target.value)} />
            </label>
          )}
          <div className="row">
            <button className="btn primary" onClick={saveDraft}>
              {draft.missing.includes("serial") && isMolde(draft) ? "Salvar sem número da caixa" : "Salvar caixa"}
            </button>
            <button
              className="btn"
              onClick={() => {
                setDraft(null);
                setMsg(null);
              }}
            >
              Descartar
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="row spread">
          <strong>Esta entrega</strong>
          <span className="mono">
            {rows.length} cx · {kg(totalKg)}
          </span>
        </div>
        {rows.length === 0 && (
          <p className="muted">Nenhuma caixa ainda. Abra a câmera e aponte para o código de barras da etiqueta.</p>
        )}
        <div>
          {rows.map(r => {
            const v = validity(r.reading.useBy);
            const state = r.sentAt
              ? { t: "Enviada", c: "ok" }
              : r.state === "pendente"
                ? { t: online ? "Enviando" : "Na fila", c: "info" }
                : r.state === "duplicada"
                  ? { t: "Duplicada", c: "bad" }
                  : r.state === "sem_produto"
                    ? { t: "Cadastrar produto", c: "warn" }
                    : { t: "Erro", c: "bad" };
            return (
              <div className="item" key={r.id}>
                <div>
                  <strong>{productName(r.reading.productKey, r.productId)}</strong>{" "}
                  <span className={`pill ${state.c}`}>{state.t}</span>
                </div>
                <div className="mono">{kg(r.reading.netWeightKg)}</div>
                <div className="muted">
                  Lote {r.reading.lot ?? "—"} · <span className={`pill ${v.tone}`}>{v.text}</span>
                </div>
                <div className="muted mono" style={{ textAlign: "right" }}>
                  {r.reading.serial ?? ""}
                </div>
                {r.error && !r.sentAt && (
                  <div className="muted" style={{ gridColumn: "1 / -1" }}>
                    {r.error}{" "}
                    {r.state === "duplicada" && (
                      <button className="btn small" onClick={() => remove(r.id)}>
                        Remover
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="row spread">
          <span className="muted">
            {lastSync
              ? `Última sincronização às ${lastSync}`
              : online
                ? "Sincroniza automaticamente"
                : "Sem internet: as caixas ficam salvas neste celular"}
          </span>
          <div className="row">
            <button className="btn small" onClick={sync} disabled={!online}>
              Sincronizar
            </button>
            <button className="btn small" onClick={newDelivery}>
              Nova entrega
            </button>
          </div>
        </div>
      </section>

      <button
        className="btn small"
        style={{ alignSelf: "flex-start" }}
        onClick={async () => {
          setCurrentOrg(null);
          await supabase().auth.signOut();
          router.replace("/login");
        }}
      >
        Sair
      </button>
    </main>
  );
}
