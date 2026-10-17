"use client";
import { useCallback, useEffect, useState } from "react";
import Nav from "@/components/Nav";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { currentOrg } from "@/lib/org";
import type { Org } from "@/lib/offline-db";

type Role = "owner" | "admin" | "staff";
type TeamRow = { kind: "membro" | "convite"; id: string; email: string; role: Role; is_me: boolean };
type Msg = { text: string; tone: "ok" | "warn" | "bad" | "info" };

const ROLE_LABEL: Record<Role, string> = { owner: "Dono", admin: "Admin", staff: "Funcionário" };

export default function EquipePage() {
  const router = useRouter();
  const [org, setOrg] = useState<Org | null>(null);
  const [team, setTeam] = useState<TeamRow[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(true);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async (o: Org) => {
    const { data, error } = await supabase().rpc("list_team", { target_org: o.id });
    setLoaded(true);
    if (error)
      return setMsg({ text: "Não consegui carregar a equipe. Verifique a internet e tente de novo.", tone: "bad" });
    setTeam((data ?? []) as TeamRow[]);
  }, []);

  useEffect(() => {
    const o = currentOrg();
    setOnline(navigator.onLine);
    supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (!data.session || !o) return router.replace("/login");
        setOrg(o);
        if (navigator.onLine) load(o);
        else setLoaded(true);
      });
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [router, load]);

  const me = team.find(t => t.kind === "membro" && t.is_me);
  const canManage = me?.role === "owner" || me?.role === "admin";
  const members = team.filter(t => t.kind === "membro");
  const invites = team.filter(t => t.kind === "convite");

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!org || !email.trim()) return;
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase().rpc("invite_member", {
      target_org: org.id,
      member_email: email.trim(),
      member_role: role,
    });
    setBusy(false);
    if (error) return setMsg({ text: traduz(error.message), tone: "bad" });
    setMsg(
      data === "adicionado"
        ? { text: `${email.trim()} já tinha conta e entrou na empresa.`, tone: "ok" }
        : {
            text: `Convite registrado. Peça para a pessoa abrir o app e criar a conta com ${email.trim()}. Ela entra direto na ${org.name}.`,
            tone: "ok",
          },
    );
    setEmail("");
    setRole("staff");
    load(org);
  }

  async function remove(row: TeamRow) {
    if (!org) return;
    if (confirming !== row.id) return setConfirming(row.id);
    setConfirming(null);
    setBusy(true);
    const { error } =
      row.kind === "membro"
        ? await supabase().rpc("remove_member", { target_org: org.id, member_id: row.id })
        : await supabase().rpc("cancel_invitation", { invitation_id: row.id });
    setBusy(false);
    if (error) return setMsg({ text: traduz(error.message), tone: "bad" });
    setMsg({ text: row.kind === "membro" ? `${row.email} saiu da empresa.` : "Convite cancelado.", tone: "info" });
    load(org);
  }

  return (
    <main>
      <Nav />
      <div>
        <h1>Equipe</h1>
        <div className="muted">{org?.name ?? "…"}</div>
      </div>

      {!online && <p className="note warn">Sem internet. A equipe só pode ser vista e alterada com conexão.</p>}

      {canManage && online && (
        <form className="panel" onSubmit={invite}>
          <strong>Convidar pessoa</strong>
          <label>
            Email
            <input
              id="inviteEmail"
              type="email"
              autoComplete="off"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="nome@empresa.co.uk"
            />
          </label>
          <label>
            Função
            <select id="inviteRole" value={role} onChange={e => setRole(e.target.value as Role)}>
              <option value="staff">Funcionário: recebe e consulta caixas</option>
              <option value="admin">Admin: também convida pessoas</option>
              {me?.role === "owner" && <option value="owner">Dono: acesso total</option>}
            </select>
          </label>
          <button className="btn primary" disabled={busy}>
            Convidar
          </button>
          <p className="muted" style={{ margin: 0 }}>
            A pessoa entra na empresa quando criar a conta com este email e confirmar pelo link que o app envia.
          </p>
        </form>
      )}

      {msg && (
        <p className={`note ${msg.tone}`} role="status">
          {msg.text}
        </p>
      )}

      <section className="panel">
        <div className="row spread">
          <strong>Membros</strong>
          <span className="mono">{members.length}</span>
        </div>
        {!loaded && <p className="muted">Carregando…</p>}
        <div>
          {members.map(m => (
            <div className="item" key={m.id}>
              <div>
                <strong>{m.email}</strong> {m.is_me && <span className="pill info">Você</span>}
              </div>
              <span className="pill ok">{ROLE_LABEL[m.role]}</span>
              {canManage && !m.is_me && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <button className="btn small" disabled={busy} onClick={() => remove(m)}>
                    {confirming === m.id ? "Toque de novo para remover" : "Remover da empresa"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {invites.length > 0 && (
        <section className="panel">
          <div className="row spread">
            <strong>Convites pendentes</strong>
            <span className="mono">{invites.length}</span>
          </div>
          <div>
            {invites.map(i => (
              <div className="item" key={i.id}>
                <div>
                  <strong>{i.email}</strong>
                  <div className="muted">Ainda não criou a conta</div>
                </div>
                <span className="pill warn">{ROLE_LABEL[i.role]}</span>
                {canManage && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <button className="btn small" disabled={busy} onClick={() => remove(i)}>
                      {confirming === i.id ? "Toque de novo para cancelar" : "Cancelar convite"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {loaded && me && !canManage && <p className="muted">Só donos e admins podem convidar ou remover pessoas.</p>}
    </main>
  );
}

function traduz(m: string) {
  if (/check constraint|invitations_email/i.test(m)) return "Email inválido. Confira e tente de novo.";
  if (/fetch|network/i.test(m)) return "Sem internet. Tente de novo quando conectar.";
  return m;
}
