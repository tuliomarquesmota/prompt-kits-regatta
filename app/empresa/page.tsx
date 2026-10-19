"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import SectionHeader from "@/components/SectionHeader";
import { CADASTRO_TABS, EMPRESA_TABS, cadastroHref } from "@/components/cadastros/tabs";
import { supabase } from "@/lib/supabase";
import { currentOrg, setCurrentOrg } from "@/lib/org";
import type { Org } from "@/lib/offline-db";
import { amAdmin, getCompany, saveCompany } from "@/lib/registry";
import { checkCompany, COMPANY_FIELDS, type CompanyForm } from "@/lib/company";
import { errorText } from "@/lib/sales";

const empty = Object.fromEntries(COMPANY_FIELDS.map(k => [k, ""])) as CompanyForm;

type Field = {
  key: keyof CompanyForm;
  label: string;
  hint?: string;
  area?: boolean;
  mode?: "numeric" | "email" | "tel";
};
const SECTIONS: { title: string; fields: Field[] }[] = [
  {
    title: "Empresa",
    fields: [
      { key: "name", label: "Nome no app" },
      { key: "legal_name", label: "Razão social (como na Companies House)", hint: "Ex.: SA Global Meat Ltd" },
      { key: "company_number", label: "Número na Companies House", hint: "8 caracteres" },
      { key: "vat_number", label: "Número de VAT", hint: "GB seguido de 9 dígitos" },
      { key: "address", label: "Endereço", area: true },
      { key: "email", label: "Email", mode: "email" },
      { key: "phone", label: "Telefone", mode: "tel" },
    ],
  },
  {
    title: "Banco (para o cliente pagar)",
    fields: [
      { key: "bank_name", label: "Banco", hint: "Ex.: Barclays" },
      { key: "bank_account_name", label: "Nome da conta" },
      { key: "sort_code", label: "Sort code", hint: "12-34-56", mode: "numeric" },
      { key: "account_number", label: "Número da conta", hint: "8 dígitos", mode: "numeric" },
    ],
  },
  {
    title: "Rodapé da invoice",
    fields: [
      {
        key: "invoice_notes",
        label: "Texto livre (opcional)",
        hint: "Ex.: Mercadoria refrigerada: conferir na entrega.",
        area: true,
      },
    ],
  },
];

/** Dados da empresa que aparecem na invoice. Só dono e admin editam. */
export default function EmpresaPage() {
  const router = useRouter();
  const [org, setOrg] = useState<Org | null>(null);
  const [form, setForm] = useState<CompanyForm>(empty);
  const [admin, setAdmin] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: string } | null>(null);

  useEffect(() => {
    const o = currentOrg();
    supabase()
      .auth.getSession()
      .then(async ({ data }) => {
        if (!data.session || !o) return router.replace("/login");
        setOrg(o);
        try {
          const [c, a] = await Promise.all([getCompany(o.id), amAdmin(o.id)]);
          setForm(Object.fromEntries(COMPANY_FIELDS.map(k => [k, c[k] ?? ""])) as CompanyForm);
          setAdmin(a);
        } catch (e) {
          setMsg({ text: errorText(e), tone: "bad" });
        } finally {
          setLoaded(true);
        }
      });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!org) return;
    const c = checkCompany(form);
    if (!c.ok) return setMsg({ text: c.error, tone: "bad" });
    setBusy(true);
    setMsg(null);
    try {
      await saveCompany(org.id, c.row);
      setForm(Object.fromEntries(COMPANY_FIELDS.map(k => [k, c.row[k] ?? ""])) as CompanyForm);
      if (c.row.name !== org.name) {
        const updated = { ...org, name: c.row.name };
        setCurrentOrg(updated);
        setOrg(updated);
      }
      setMsg({ text: "Dados salvos. As próximas invoices já saem com eles.", tone: "ok" });
    } catch (err) {
      setMsg({ text: errorText(err), tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <Nav />
      <SectionHeader
        title="Cadastros"
        tabs={CADASTRO_TABS}
        current="empresa"
        onTab={k => router.push(cadastroHref(k))}
        sub={EMPRESA_TABS}
        subCurrent="empresa"
        onSub={k => router.push(cadastroHref(k))}
      />

      {!loaded && <p className="muted">Carregando…</p>}
      {loaded && !admin && (
        <p className="note info">Só donos e admins mudam estes dados. Você pode ver, mas não editar.</p>
      )}

      {loaded && (
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {SECTIONS.map(s => (
            <fieldset key={s.title} className="panel" disabled={!admin} style={{ margin: 0 }}>
              <legend style={{ fontWeight: 700, padding: "0 4px" }}>{s.title}</legend>
              {s.fields.map(f => (
                <label key={f.key}>
                  {f.label}
                  {f.area ? (
                    <textarea
                      rows={3}
                      value={form[f.key]}
                      placeholder={f.hint}
                      onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))}
                    />
                  ) : (
                    <input
                      value={form[f.key]}
                      placeholder={f.hint}
                      inputMode={f.mode === "numeric" ? "numeric" : undefined}
                      type={f.mode === "email" ? "email" : f.mode === "tel" ? "tel" : "text"}
                      required={f.key === "name"}
                      onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))}
                    />
                  )}
                </label>
              ))}
            </fieldset>
          ))}
          {admin && (
            <button className="btn primary" disabled={busy}>
              {busy ? "Salvando…" : "Salvar dados"}
            </button>
          )}
        </form>
      )}

      {msg && (
        <p className={`note ${msg.tone}`} role="status">
          {msg.text}
        </p>
      )}
    </main>
  );
}
