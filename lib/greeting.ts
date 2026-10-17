// Saudação da barra do topo.

/** Primeiro nome para a saudação: o nome salvo na conta ou, sem ele, a parte do email antes do @. */
export function greetingName(meta: Record<string, unknown> | undefined, email: string | undefined): string {
  const saved = typeof meta?.name === "string" ? meta.name.trim() : "";
  if (saved) return saved.split(/\s+/)[0];
  const local = (email ?? "").split("@")[0].split(/[._\-+0-9]/)[0];
  return local ? local[0].toUpperCase() + local.slice(1).toLowerCase() : "";
}
