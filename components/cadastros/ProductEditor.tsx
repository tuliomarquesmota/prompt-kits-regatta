"use client";
import { useEffect, useState } from "react";
import type { Org } from "@/lib/offline-db";
import Scanner from "@/components/Scanner";
import { getCatalog } from "@/lib/catalog";
import { readLabel } from "@/lib/labels";
import { checkProduct, numberText, type ProductForm } from "@/lib/products";
import { deleteProduct, listProducts, listSuppliers, registryError, saveProduct, type Supplier } from "@/lib/registry";

type Props = {
  org: Org;
  /** "novo" ou o id do produto */
  productId: string;
  /** Vindo do Receber: código da caixa lida e fornecedor reconhecido */
  presetCode: string | null;
  presetSupplier: string | null;
  go: (q: string) => void;
};

const empty: ProductForm = {
  name: "",
  supplier_id: "",
  gtin: "",
  sku: "",
  price: "",
  minKg: "",
  maxKg: "",
  vat: "0",
};

export default function ProductEditor({ org, productId, presetCode, presetSupplier, go }: Props) {
  const isNew = productId === "novo";
  const [form, setForm] = useState<ProductForm>({
    ...empty,
    gtin: presetCode ?? "",
    supplier_id: presetSupplier ?? "",
  });
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loaded, setLoaded] = useState(isNew);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: string } | null>(null);

  useEffect(() => {
    listSuppliers(org.id)
      .then(setSuppliers)
      .catch(e => setMsg({ text: registryError(e, "fornecedor"), tone: "bad" }));
    if (isNew) return;
    listProducts(org.id)
      .then(list => {
        const p = list.find(x => x.id === productId);
        if (!p) {
          setMsg({ text: "Produto não encontrado. Ele pode ter sido apagado.", tone: "bad" });
          return;
        }
        setForm({
          name: p.name,
          supplier_id: p.supplier_id ?? "",
          gtin: p.gtin ?? "",
          sku: p.sku ?? "",
          price: numberText(p.default_price_kg),
          minKg: numberText(p.min_box_kg),
          maxKg: numberText(p.max_box_kg),
          vat: String(Number(p.vat_rate)),
        });
        setLoaded(true);
      })
      .catch(e => setMsg({ text: registryError(e, "produto"), tone: "bad" }));
  }, [org.id, productId, isNew]);

  const set = (k: keyof ProductForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function onCodes(codes: string[]) {
    const catalog = await getCatalog(org, navigator.onLine);
    const r = catalog ? readLabel(codes, catalog.profiles) : null;
    if (!r) {
      setMsg({
        text: "Esta etiqueta não bate com nenhum fornecedor cadastrado. Mande a foto da etiqueta para criarmos o perfil do fornecedor.",
        tone: "warn",
      });
      return;
    }
    setScanning(false);
    setForm(f => ({ ...f, gtin: r.productKey, supplier_id: r.supplierId ?? f.supplier_id }));
    setMsg({
      text: `Código ${r.productKey} lido${r.supplierName ? ` (${r.supplierName})` : ""}.`,
      tone: "ok",
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = checkProduct(form);
    if (!c.ok) return setMsg({ text: c.error, tone: "bad" });
    setBusy(true);
    setMsg(null);
    try {
      await saveProduct(org.id, isNew ? null : productId, c.row);
      // Volta para onde a pessoa estava: quem veio do Receber volta para lá
      if (presetCode) window.location.href = "/receber";
      else go("");
    } catch (err) {
      setMsg({ text: registryError(err, "produto"), tone: "bad" });
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirmDelete) return setConfirmDelete(true);
    setBusy(true);
    try {
      await deleteProduct(org.id, productId);
      go("");
    } catch (err) {
      setMsg({ text: registryError(err, "produto"), tone: "bad" });
      setConfirmDelete(false);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row spread">
        <h1>{isNew ? "Novo produto" : "Editar produto"}</h1>
        <button className="btn small" onClick={() => go("")}>
          ← Produtos
        </button>
      </div>

      {presetCode && isNew && (
        <p className="note info">
          Produto da caixa que você leu. Dê um nome e salve: as caixas que estão esperando são enviadas sozinhas.
        </p>
      )}

      {!loaded && !msg && <p className="muted">Carregando…</p>}

      {loaded && (
        <form className="panel" onSubmit={submit}>
          <label>
            Nome
            <input required value={form.name} onChange={set("name")} placeholder="Picanha" autoFocus={isNew} />
          </label>
          <label>
            Fornecedor
            <select value={form.supplier_id} onChange={set("supplier_id")}>
              <option value="">Sem fornecedor</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Código da etiqueta
            <input
              className="mono"
              value={form.gtin}
              onChange={set("gtin")}
              placeholder="Leia da etiqueta"
              autoCapitalize="off"
              spellCheck={false}
            />
          </label>
          {scanning ? (
            <>
              <Scanner onCodes={onCodes} />
              <button type="button" className="btn" onClick={() => setScanning(false)}>
                Fechar câmera
              </button>
            </>
          ) : (
            <button type="button" className="btn" onClick={() => setScanning(true)}>
              Ler código de uma caixa
            </button>
          )}
          <label>
            Preço padrão por kg (£)
            <input inputMode="decimal" value={form.price} onChange={set("price")} placeholder="14,90" />
          </label>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <label style={{ flex: 1 }}>
              Caixa pesa no mínimo (kg)
              <input inputMode="decimal" value={form.minKg} onChange={set("minKg")} placeholder="15" />
            </label>
            <label style={{ flex: 1 }}>
              No máximo (kg)
              <input inputMode="decimal" value={form.maxKg} onChange={set("maxKg")} placeholder="30" />
            </label>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            A faixa de peso serve para avisar quando a leitura parecer errada.
          </p>
          <label>
            VAT
            <select value={form.vat} onChange={set("vat")}>
              <option value="0">0% · zero-rated (maioria da carne fresca)</option>
              <option value="5">5% · taxa reduzida</option>
              <option value="20">20% · taxa padrão</option>
            </select>
          </label>
          <p className="muted" style={{ margin: 0 }}>
            Confirme a taxa de cada produto com o contador antes de emitir invoices.
          </p>
          <label>
            Código interno (opcional)
            <input value={form.sku} onChange={set("sku")} placeholder="Ex.: o código usado no SOS" />
          </label>
          <button className="btn primary" disabled={busy}>
            {isNew ? "Cadastrar produto" : "Salvar alterações"}
          </button>
        </form>
      )}

      {msg && (
        <p className={`note ${msg.tone}`} role="status">
          {msg.text}
        </p>
      )}

      {loaded && !isNew && (
        <button className="btn" onClick={remove} disabled={busy}>
          {confirmDelete ? "Toque de novo para apagar" : "Apagar produto"}
        </button>
      )}
    </>
  );
}
