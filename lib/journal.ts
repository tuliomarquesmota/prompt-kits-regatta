// Livro contábil: regras do lançamento manual e períodos. Lógica pura, para testar.
import { parseNumber } from "./products.ts";

export type EntryLineForm = { account_id: string; debit: string; credit: string };
export type EntryLine = { account_id: string; debit: number; credit: number };

/** Confere o lançamento manual: cada linha com um lado só, débitos = créditos. Soma em pence. */
export function checkEntry(
  description: string,
  lines: EntryLineForm[],
): { ok: true; lines: EntryLine[]; total: number } | { ok: false; error: string } {
  if (!description.trim()) return { ok: false, error: "Escreva uma descrição para o lançamento." };
  const used = lines.filter(l => l.account_id || l.debit.trim() || l.credit.trim());
  if (used.length < 2) return { ok: false, error: "O lançamento precisa de pelo menos duas linhas." };
  const out: EntryLine[] = [];
  let dr = 0;
  let cr = 0;
  for (const [i, l] of used.entries()) {
    const d = parseNumber(l.debit) ?? 0;
    const c = parseNumber(l.credit) ?? 0;
    if (!l.account_id) return { ok: false, error: `Linha ${i + 1}: escolha a conta.` };
    if (Number.isNaN(d) || Number.isNaN(c)) return { ok: false, error: `Linha ${i + 1}: valor inválido.` };
    if ((d > 0 && c > 0) || (d === 0 && c === 0))
      return { ok: false, error: `Linha ${i + 1}: preencha só o débito ou só o crédito.` };
    const dp = Math.round(d * 100);
    const cp = Math.round(c * 100);
    dr += dp;
    cr += cp;
    out.push({ account_id: l.account_id, debit: dp / 100, credit: cp / 100 });
  }
  if (dr !== cr)
    return {
      ok: false,
      error: `Débitos (£${(dr / 100).toFixed(2)}) e créditos (£${(cr / 100).toFixed(2)}) precisam ser iguais.`,
    };
  return { ok: true, lines: out, total: dr / 100 };
}

/** Primeiro e último dia de um mês "2026-10". */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

/** Mês anterior ou seguinte: shiftMonth("2026-01", -1) = "2025-12". */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]}/${y}`;
}

/** A data está num período fechado? (datas "AAAA-MM-DD" comparam como texto) */
export function isLocked(date: string, lockedUntil: string | null): boolean {
  return !!lockedUntil && date.slice(0, 10) <= lockedUntil;
}

/**
 * Próximo mês que pode ser fechado: o mês seguinte ao último fechado ou, se nada foi
 * fechado, o mês passado. Só vale se o mês já terminou. Devolve "AAAA-MM" ou null.
 */
export function nextToClose(lockedUntil: string | null, today: string): string | null {
  const current = today.slice(0, 7);
  const next = lockedUntil ? shiftMonth(lockedUntil.slice(0, 7), 1) : shiftMonth(current, -1);
  return next < current ? next : null;
}

/** Ao reabrir só o último mês fechado, o livro fica fechado até o fim do mês anterior. */
export function reopenTarget(lockedUntil: string): string {
  return monthRange(shiftMonth(lockedUntil.slice(0, 7), -1)).to;
}
