"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import TopBar from "@/components/TopBar";

const ITEMS = [
  { href: "/receber", label: "Receber" },
  { href: "/stock", label: "Stock" },
  { href: "/vendas", label: "Vendas" },
  { href: "/financas", label: "Finanças" },
  { href: "/cadastros", label: "Cadastros" },
];

/** Barra com saudação e Sair, e o menu das telas principais, no topo de cada uma. */
export default function Nav() {
  const path = usePathname();
  // Empresa e Equipe ficam dentro de Cadastros
  const active = (href: string) =>
    path === href || (href === "/cadastros" && (path === "/equipe" || path === "/empresa"));
  return (
    <>
      <TopBar />
      <nav aria-label="Telas" className="nav">
        {ITEMS.map(i => (
          <Link
            key={i.href}
            href={i.href}
            className={active(i.href) ? "on" : ""}
            aria-current={active(i.href) ? "page" : undefined}
          >
            {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
