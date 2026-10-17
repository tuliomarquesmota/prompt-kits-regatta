"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { setCurrentOrg } from "@/lib/org";

/** Botão Sair com confirmação, para ninguém sair sem querer (ex.: tocando com luva). */
export default function LogoutButton({ pending = 0 }: { pending?: number }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    setCurrentOrg(null);
    await supabase().auth.signOut();
    router.replace("/login");
  }

  if (!asking)
    return (
      <button className="btn small" style={{ alignSelf: "flex-start" }} onClick={() => setAsking(true)}>
        Sair
      </button>
    );

  return (
    <section className="panel" role="alertdialog" aria-labelledby="sairTitulo">
      <strong id="sairTitulo">Tem certeza que deseja sair?</strong>
      {pending > 0 && (
        <p className="note warn" style={{ margin: 0 }}>
          {pending} caixa{pending === 1 ? "" : "s"} ainda não {pending === 1 ? "foi enviada" : "foram enviadas"}. Elas
          continuam salvas neste celular e são enviadas quando você entrar de novo.
        </p>
      )}
      <div className="row">
        <button className="btn primary" style={{ flex: 1 }} onClick={logout} disabled={busy}>
          {busy ? "Saindo…" : "Sim, sair"}
        </button>
        <button className="btn" style={{ flex: 1 }} onClick={() => setAsking(false)} disabled={busy} autoFocus>
          Cancelar
        </button>
      </div>
    </section>
  );
}
