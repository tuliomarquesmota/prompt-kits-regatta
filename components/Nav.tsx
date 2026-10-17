"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import TopBar from "@/components/TopBar";

const ITEMS = [
  { href: "/receber", label: "Receber" },
  { href: "/stock", label: "Stock" },
  { href: "/vendas", label: "Vendas" },
  { href: "/cadastros", label: "Cadastros" },
  { href: "/equipe", label: "Equipe" },
];

/** Barra com saudação e Sair, e o menu das telas principais, no topo de cada uma. */
export default function Nav() {
  const path = usePathname();
  return (
    <>
      <TopBar />
      <nav aria-label="Telas" className="nav">
        {ITEMS.map(i => (
          <Link
            key={i.href}
            href={i.href}
            className={path === i.href ? "on" : ""}
            aria-current={path === i.href ? "page" : undefined}
          >
            {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
