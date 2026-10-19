"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { currentOrg, setCurrentOrg } from "@/lib/org";
import { listPending } from "@/lib/offline-db";
import { greetingName, initial, isTestOrg } from "@/lib/greeting";
import { myOrgs, refreshCatalog } from "@/lib/catalog";
import type { Org } from "@/lib/offline-db";
import Sheet from "./Sheet";

/**
 * Barra do topo. À esquerda, a empresa atual (toque para trocar).
 * À direita, a bolinha da conta (nome e Sair). Empresa de teste fica laranja.
 */
export default function TopBar() {
  const router = useRouter();
  const [first, setFirst] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState<Org | null>(null);
  const [online, setOnline] = useState(true);
  const [sheet, setSheet] = useState<"none" | "empresa" | "conta">("none");
  const [editing, setEditing] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setOrg(currentOrg());
    setOnline(navigator.onLine);
    supabase()
      .auth.getSession()
      .then(({ data }) => {
        const u = data.session?.user;
        setFirst(greetingName(u?.user_metadata, u?.email));
        setFullName(typeof u?.user_metadata?.name === "string" ? u.user_metadata.name : "");
        setEmail(u?.email ?? "");
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

  const close = useCallback(() => {
    setSheet("none");
    setEditing(false);
    setConfirmOut(false);
    setMsg(null);
  }, []);

  async function openOrgs() {
    setSheet("empresa");
    setMsg(null);
    if (!navigator.onLine) return setOrgs([]);
    try {
      setOrgs(await myOrgs());
    } catch {
      setOrgs([]);
    }
  }

  async function switchOrg(o: Org) {
    if (o.id === org?.id) return close();
    setBusy(true);
    setCurrentOrg(o);
    try {
      await refreshCatalog(o);
    } catch {
      /* o catálogo é baixado de novo na próxima tela */
    }
    window.location.reload();
  }

  async function askLogout() {
    setMsg(null);
    try {
      const list = org ? await listPending(org.id) : [];
      setPending(list.filter(p => p.state !== "duplicada").length);
    } catch {
      setPending(0);
    }
    setConfirmOut(true);
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
    if (!n) return setMsg("Digite seu nome.");
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
    setFirst(greetingName({ name: n }, undefined));
    setEditing(false);
  }

  const test = isTestOrg(org?.name);

  return (
    <>
      <header className="topbar">
        <button
          className={`org-chip ${test ? "test" : ""}`}
          onClick={openOrgs}
          aria-haspopup="dialog"
          aria-label={`Empresa: ${org?.name ?? "nenhuma"}. Toque para trocar.`}
        >
          <span className="org-name">{org?.name ?? "Empresa"}</span>
          <span aria-hidden="true">▾</span>
        </button>
        <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
          {!online && <span className="pill warn">Sem internet</span>}
          <button
            className="avatar"
            onClick={() => setSheet("conta")}
            aria-haspopup="dialog"
            aria-label={`Sua conta${first ? `: ${first}` : ""}`}
          >
            {initial(first, email)}
          </button>
        </div>
      </header>

      {test && (
        <p className="note warn" style={{ margin: 0, fontWeight: 700 }}>
          Você está na empresa de TESTE. Nada aqui vale de verdade.
        </p>
      )}

      {sheet === "empresa" && (
        <Sheet title="Trocar de empresa" onClose={close}>
          {!online && <p className="note warn">Sem internet: para trocar de empresa precisa de conexão.</p>}
          {online && !orgs && <p className="muted">Carregando empresas…</p>}
          {(orgs && orgs.length > 0 ? orgs : org ? [org] : []).map(o => {
            const current = o.id === org?.id;
            return (
              <button
                key={o.id}
                className={`sheet-option ${current ? "on" : ""}`}
                onClick={() => switchOrg(o)}
                disabled={busy || (!online && !current)}
                aria-current={current ? "true" : undefined}
              >
                <span>
                  {o.name} {isTestOrg(o.name) && <span className="pill warn">TESTE</span>}
                </span>
                <span aria-hidden="true">{current ? "✓" : ""}</span>
              </button>
            );
          })}
          {orgs && orgs.length === 1 && <p className="muted">Você só tem acesso a esta empresa.</p>}
          {busy && <p className="muted">Trocando de empresa…</p>}
        </Sheet>
      )}

      {sheet === "conta" && (
        <Sheet title="Sua conta" onClose={close}>
          <div className="row" style={{ gap: 12, flexWrap: "nowrap" }}>
            <span className="avatar" aria-hidden="true">
              {initial(first, email)}
            </span>
            <span style={{ minWidth: 0 }}>
              <strong>Olá{first ? `, ${first}` : ""}</strong>
              <span className="muted" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>
                {email}
              </span>
            </span>
          </div>

          {!editing && !confirmOut && (
            <>
              <button
                className="sheet-item"
                onClick={() => {
                  setEditing(true);
                  setMsg(null);
                }}
              >
                Mudar meu nome
              </button>
              <button className="sheet-item danger" onClick={askLogout}>
                Sair
              </button>
            </>
          )}

          {editing && (
            <form onSubmit={saveName} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                <button type="button" className="btn" style={{ flex: 1 }} onClick={() => setEditing(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {confirmOut && (
            <div
              role="alertdialog"
              aria-labelledby="sairTitulo"
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <strong id="sairTitulo">Tem certeza que deseja sair?</strong>
              {pending > 0 && (
                <p className="note warn" style={{ margin: 0 }}>
                  {pending} caixa{pending === 1 ? "" : "s"} ainda não {pending === 1 ? "foi enviada" : "foram enviadas"}
                  . Elas continuam salvas neste celular e são enviadas quando você entrar de novo.
                </p>
              )}
              <div className="row">
                <button className="btn primary" style={{ flex: 1 }} onClick={logout} disabled={busy}>
                  {busy ? "Saindo…" : "Sim, sair"}
                </button>
                <button className="btn" style={{ flex: 1 }} onClick={() => setConfirmOut(false)} disabled={busy}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {msg && <p className="note bad">{msg}</p>}
        </Sheet>
      )}
    </>
  );
}
