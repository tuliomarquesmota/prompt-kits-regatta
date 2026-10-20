"use client";
import { useEffect, useRef } from "react";

export type Tab = { key: string; label: string };

type Props = {
  title: string;
  subtitle?: string;
  tabs: Tab[];
  current: string;
  onTab: (key: string) => void;
  /** Segunda fileira, dentro da aba atual (ex.: Livro → Lançamentos, Fechar mês…) */
  sub?: Tab[];
  subCurrent?: string;
  onSub?: (key: string) => void;
};

function TabRow({
  tabs,
  current,
  onTab,
  label,
  className,
}: {
  tabs: Tab[];
  current: string;
  onTab: (k: string) => void;
  label: string;
  className: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Em tela estreita a fileira rola de lado: mantém a aba atual à vista
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(".on")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [current]);
  return (
    <div className={className} role="tablist" aria-label={label} ref={ref}>
      {tabs.map(t => (
        <button
          key={t.key}
          role="tab"
          aria-selected={current === t.key}
          aria-current={current === t.key ? "page" : undefined}
          className={current === t.key ? "on" : ""}
          onClick={() => onTab(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Título da seção e abas sempre visíveis: onde você está fica em negrito e destacado. */
export default function SectionHeader({ title, subtitle, tabs, current, onTab, sub, subCurrent, onSub }: Props) {
  return (
    <div className="no-print" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h1>{title}</h1>
        {subtitle && <div className="muted">{subtitle}</div>}
      </div>
      <TabRow tabs={tabs} current={current} onTab={onTab} label={`Áreas de ${title}`} className="tabs" />
      {sub && onSub && (
        <TabRow
          tabs={sub}
          current={subCurrent ?? ""}
          onTab={onSub}
          label={`Dentro de ${tabs.find(t => t.key === current)?.label ?? title}`}
          className="subtabs"
        />
      )}
    </div>
  );
}
