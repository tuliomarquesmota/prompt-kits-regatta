"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { myOrgs, refreshCatalog } from "@/lib/catalog";
import { setCurrentOrg } from "@/lib/org";
import type { Org } from "@/lib/offline-db";

type Step = "auth" | "orgs";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("auth");
  const [mode, setMode] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgName, setOrgName] = useState("");
  const [seed, setSeed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "bad" | "ok" | "info" } | null>(null);

  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => { if (data.session) loadOrgs(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadOrgs() {
    const list = await myOrgs();
    setOrgs(list);
    if (list.length === 1) return choose(list[0]);
    setStep("orgs");
  }

  async function choose(org: Org) {
    setBusy(true);
    setCurrentOrg(org);
    try { await refreshCatalog(org); } catch { /* o catálogo é baixado de novo na tela de recebimento */ }
    router.replace("/receber");
  }

  async function submitAuth(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const sb = supabase();
    const { error } = mode === "entrar"
      ? await sb.auth.signInWithPassword({ email, password })
      : await sb.auth.signUp({ email, password });
    setBusy(false);
    if (error) return setMsg({ text: traduz(error.message), tone: "bad" });
    const { data } = await sb.auth.getSession();
    if (!data.session) return setMsg({ text: "Conta criada. Confirme pelo link enviado ao seu email e depois entre.", tone: "ok" });
    loadOrgs();
  }

  async function createOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!orgName.trim()) return;
    setBusy(true); setMsg(null);
    const sb = supabase();
    const { data: id, error } = await sb.rpc("create_organization", { org_name: orgName.trim() });
    if (error) { setBusy(false); return setMsg({ text: error.message, tone: "bad" }); }
    if (seed) await sb.rpc("seed_label_profiles", { target_org: id });
    choose({ id, name: orgName.trim() });
  }

  return (
    <main>
      <h1>LOTE · Recebimento</h1>

      {step === "auth" && (
        <form className="panel" onSubmit={submitAuth}>
          <label>Email<input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label>Senha<input id="password" type="password" autoComplete={mode === "entrar" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={e => setPassword(e.target.value)} /></label>
          <button className="btn primary" disabled={busy}>{mode === "entrar" ? "Entrar" : "Criar conta"}</button>
          <button type="button" className="btn small" onClick={() => setMode(mode === "entrar" ? "criar" : "entrar")}>
            {mode === "entrar" ? "Ainda não tenho conta" : "Já tenho conta"}
          </button>
        </form>
      )}

      {step === "orgs" && (
        <>
          {orgs.length > 0 && (
            <section className="panel">
              <strong>Escolha a empresa</strong>
              {orgs.map(o => <button key={o.id} className="btn" disabled={busy} onClick={() => choose(o)}>{o.name}</button>)}
            </section>
          )}
          <form className="panel" onSubmit={createOrg}>
            <strong>{orgs.length ? "Ou crie outra empresa" : "Crie sua empresa"}</strong>
            <label>Nome da empresa<input id="org" value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="SA Global Meat Ltd" /></label>
            <label style={{ flexDirection: "row", alignItems: "center", fontWeight: 400 }}>
              <input id="seed" type="checkbox" checked={seed} onChange={e => setSeed(e.target.checked)} style={{ width: 22, minHeight: 22 }} />
              Carregar fornecedores e produtos de exemplo (Teys, Silver Fern, Liffey)
            </label>
            <button className="btn primary" disabled={busy}>Criar empresa</button>
          </form>
        </>
      )}

      {msg && <p className={`note ${msg.tone}`} role="status">{msg.text}</p>}
    </main>
  );
}

function traduz(m: string) {
  if (/invalid login/i.test(m)) return "Email ou senha incorretos.";
  if (/already registered/i.test(m)) return "Este email já tem conta. Use “Já tenho conta”.";
  if (/fetch|network/i.test(m)) return "Sem internet. O primeiro acesso precisa de conexão.";
  return m;
}
