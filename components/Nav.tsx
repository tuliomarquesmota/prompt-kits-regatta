"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/receber", label: "Receber" },
  { href: "/stock", label: "Stock" },
  { href: "/vendas", label: "Vendas" },
  { href: "/equipe", label: "Equipe" },
];

/** Menu das telas principais, no topo de cada uma. */
export default function Nav() {
  const path = usePathname();
  return (
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
  );
}
