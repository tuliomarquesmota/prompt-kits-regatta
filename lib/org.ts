import type { Org } from "./offline-db";

const KEY = "lote-org";

export function currentOrg(): Org | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; }
}
export function setCurrentOrg(org: Org | null) {
  try { org ? localStorage.setItem(KEY, JSON.stringify(org)) : localStorage.removeItem(KEY); } catch {}
}
