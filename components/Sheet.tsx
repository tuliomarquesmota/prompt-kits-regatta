"use client";
import { useEffect, useRef } from "react";

type Props = { title: string; onClose: () => void; children: React.ReactNode };

/** Folha que sobe de baixo. Fecha tocando fora, no "Fechar" ou com Esc. */
export default function Sheet({ title, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = "";
      prev?.focus();
    };
  }, [onClose]);

  return (
    <div className="sheet-wrap">
      <div className="sheet-shade" onClick={onClose} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="sheet-grab" aria-hidden="true" />
        <div className="row spread">
          <strong style={{ fontSize: 18 }}>{title}</strong>
          <button className="btn small" onClick={onClose}>
            Fechar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
