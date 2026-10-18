"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { currentOrg, setCurrentOrg } from "@/lib/org";
import { listPending } from "@/lib/offline-db";
import { greetingName, isTestOrg } from "@/lib/greeting";
import { myOrgs, refreshCatalog } from "@/lib/catalog";
import type { Org } from "@/lib/offline-db";

/** Barra do topo: "Olá, nome", empresa (com troca), aviso de sem internet e Sair (com confirmação). */
export default function TopBar() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [fullName, setFullName] = useState("");
  const [org, setOrg] = useState<string>("");
  const [online, setOnline] = useState(true);
  const [panel, setPanel] = useState<"none" | "sair" | "conta">("none");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const o = currentOrg();
    setOrg(o?.name ?? "");
    setOnline(navigator.onLine);
    supabase()
      .auth.getSession()
      .then(({ data }) => {
        const u = data.session?.user;
        setName(greetingName(u?.user_metadata, u?.email));
        setFullName(typeof u?.user_metadata?.name === "string" ? u.user_metadata.name : "");
      });
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  async function askLogout() {
    setMsg(null);
    const o = currentOrg();
    try {
      const list = o ? await listPending(o.id) : [];
      setPending(list.filter(p => p.state !== "duplicada").length);
    } catch {
      setPending(0);
    }
    setPanel("sair");
  }

  async function openAccount() {
    if (panel === "conta") return setPanel("none");
    setMsg(null);
    setPanel("conta");
    if (!navigator.onLine) return;
    try {
      setOrgs(await myOrgs());
    } catch {
      setOrgs([]);
    }
  }

  async function switchOrg(o: Org) {
    setBusy(true);
    setCurrentOrg(o);
    try {
      await refreshCatalog(o);
    } catch {
      /* o catálogo é baixado de novo na próxima tela */
    }
    window.location.reload();
  }

  async function logout() {
    setBusy(true);
    setCurrentOrg(null);
    await supabase().auth.signOut();
    router.replace("/login");
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const n = fullName.trim();
    if (!n) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase().auth.updateUser({ data: { name: n } });
    setBusy(false);
    if (error)
      return setMsg(
        navigator.onLine
          ? "Não consegui salvar o nome. Tente de novo."
          : "Sem internet: o nome só pode ser trocado com conexão.",
      );
    setName(greetingName({ name: n }, undefined));
    setPanel("none");
  }

  return (
    <>
      <header className="topbar">
        <button className="hello" onClick={openAccount} aria-label="Seu nome e empresa">
          <strong>Olá{name ? `, ${name}` : ""}</strong>
          {org && <span className="muted">{org}</span>}
        </button>
        <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
          {!online && <span className="pill warn">Sem internet</span>}
          <button className="btn" style={{ padding: "0 14px" }} onClick={askLogout} disabled={busy}>
            Sair
          </button>
        </div>
      </header>

      {isTestOrg(org) && (
        <p className="note warn" style={{ margin: 0, fontWeight: 700 }}>
          Empresa de TESTE: nada aqui vale de verdade. Para trabalhar na real, toque no seu nome e troque a empresa.
        </p>
      )}

      {panel === "conta" && orgs.length > 1 && (
        <section className="panel" aria-label="Trocar de empresa">
          <strong>Trocar de empresa</strong>
          {orgs.map(o => {
            const current = o.id === currentOrg()?.id;
            return (
              <button
                key={o.id}
                className={`btn ${current ? "primary" : ""}`}
                disabled={busy || current}
                onClick={() => switchOrg(o)}
              >
                {o.name}
                {current && " · atual"}
                {!current && isTestOrg(o.name) && " · treino"}
              </button>
            );
          })}
        </section>
      )}

      {panel === "conta" && (
        <form className="panel" onSubmit={saveName}>
          <label>
            Como quer ser chamado?
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Seu nome"
              autoComplete="name"
              autoFocus
            />
          </label>
          <div className="row">
            <button className="btn primary" style={{ flex: 1 }} disabled={busy}>
              Salvar
            </button>
            <button type="button" className="btn" style={{ flex: 1 }} onClick={() => setPanel("none")}>
              Cancelar
            </button>
          </div>
          {msg && <p className="note bad">{msg}</p>}
        </form>
      )}

      {panel === "sair" && (
        <section className="panel" role="alertdialog" aria-labelledby="sairTitulo">
          <strong id="sairTitulo">Tem certeza que deseja sair?</strong>
          {pending > 0 && (
            <p className="note warn" style={{ margin: 0 }}>
              {pending} caixa{pending === 1 ? "" : "s"} ainda não {pending === 1 ? "foi enviada" : "foram enviadas"}.
              Elas continuam salvas neste celular e são enviadas quando você entrar de novo.
            </p>
          )}
          <div className="row">
            <button className="btn primary" style={{ flex: 1 }} onClick={logout} disabled={busy}>
              {busy ? "Saindo…" : "Sim, sair"}
            </button>
            <button className="btn" style={{ flex: 1 }} onClick={() => setPanel("none")} disabled={busy} autoFocus>
              Cancelar
            </button>
          </div>
        </section>
      )}
    </>
  );
}
