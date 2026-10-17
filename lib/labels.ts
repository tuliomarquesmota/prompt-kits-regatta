// Leitor de etiquetas de caixas de carne.
// 1) GS1-128: entende "(01)…(3102)…", o formato cru do leitor "]C10199…" e separadores FNC1 (\u001d).
// 2) Moldes por fornecedor: códigos próprios lidos por posição (ex.: Liffey "5300 2392 00").
// As regras de cada fornecedor vêm da tabela label_profiles e ficam em cache no celular.

export type LabelMatch =
  | { tipo: "gs1"; prefixo_gtin: string }
  | {
      tipo: "molde";
      chave: string; // prefixo da chave do produto: "liffey" → "liffey:5300"
      padrao: string; // regex do código inteiro
      produto: [number, number]; // posições [início, fim) do código do produto
      peso: [number, number]; // posições do peso
      casas: number; // casas decimais do peso
      serial_itf?: boolean; // um 2º código de 10 dígitos traz o número da caixa
    };

export type LabelRules = {
  shelf_dias?: number;
  lote?: { regra: "ai10" | "aaddd" | "ddd"; prefixo?: string };
  peso_kg?: [number, number];
};

export type LabelProfile = {
  id: string;
  supplier_id: string | null;
  supplier_name: string;
  match: LabelMatch;
  rules: LabelRules;
};

export type Reading = {
  productKey: string; // casa com products.gtin
  supplierId: string | null;
  supplierName: string | null;
  profileId: string | null;
  netWeightKg: number | null;
  packedOn: string | null; // YYYY-MM-DD
  useBy: string | null; // YYYY-MM-DD
  lot: string | null;
  serial: string | null;
  raw: string;
  missing: Array<"peso" | "validade" | "serial">;
  warnings: string[];
};

const GS = "\u001d";

function aiAt(s: string, i: number): { ai: string; len: number } | null {
  const two = s.substr(i, 2),
    three = s.substr(i, 3),
    four = s.substr(i, 4);
  if (two === "00") return { ai: two, len: 18 };
  if (two === "01" || two === "02") return { ai: two, len: 14 };
  if (["11", "12", "13", "15", "16", "17"].includes(two)) return { ai: two, len: 6 };
  if (two === "20") return { ai: two, len: 2 };
  if (["10", "21", "22", "30", "37"].includes(two) || /^9\d$/.test(two)) return { ai: two, len: 0 };
  if (/^3[1-6]\d\d$/.test(four)) return { ai: four, len: 6 };
  if (/^41\d$/.test(three)) return { ai: three, len: 13 };
  if (/^(24\d|25\d|40\d|42\d)$/.test(three)) return { ai: three, len: 0 };
  if (four === "7003") return { ai: four, len: 10 };
  if (/^70\d\d$/.test(four)) return { ai: four, len: 0 };
  return null;
}

export function parseGs1(input: string): Record<string, string> {
  const out: Record<string, string> = {};
  let s = (input ?? "").trim();
  if (!s) return out;
  if (s.includes("(")) {
    for (const m of s.matchAll(/\((\d{2,4})\)([^(]*)/g)) out[m[1]] = m[2].split(GS).join("").trim();
    return out;
  }
  s = s.replace(/^\][A-Za-z]\d/, "");
  if (s.startsWith(GS)) s = s.slice(1);
  let i = 0;
  while (i < s.length) {
    if (s[i] === GS) {
      i++;
      continue;
    }
    const spec = aiAt(s, i);
    if (!spec) break;
    i += spec.ai.length;
    let value: string;
    if (spec.len) {
      value = s.substr(i, spec.len);
      i += spec.len;
    } else {
      const end = s.indexOf(GS, i);
      value = end < 0 ? s.slice(i) : s.slice(i, end);
      i = end < 0 ? s.length : end + 1;
    }
    out[spec.ai] = value;
  }
  return out;
}

function yymmdd(v?: string): Date | null {
  if (!v || !/^\d{6}$/.test(v)) return null;
  const y = 2000 + Number(v.slice(0, 2)),
    m = Number(v.slice(2, 4)),
    d = Number(v.slice(4, 6)) || 1;
  return new Date(Date.UTC(y, m - 1, d));
}
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const dayOfYear = (d: Date) =>
  String(Math.round((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5)).padStart(3, "0");

function lotFromRule(rules: LabelRules, base: Date | null, ai10?: string): string | null {
  if (ai10) return ai10;
  if (!base || !rules.lote) return null;
  if (rules.lote.regra === "aaddd") return String(base.getUTCFullYear()).slice(2) + dayOfYear(base);
  if (rules.lote.regra === "ddd") return (rules.lote.prefixo ?? "") + dayOfYear(base);
  return null;
}

function checkWeight(rules: LabelRules, kg: number | null, warnings: string[]) {
  if (kg == null || !rules.peso_kg) return;
  const [min, max] = rules.peso_kg;
  if (kg < min || kg > max)
    warnings.push(`Peso fora da faixa normal deste fornecedor (${min}–${max} kg). Confira a etiqueta.`);
}

function readGs1(raw: string, profiles: LabelProfile[]): Reading | null {
  const ai = parseGs1(raw);
  const gtin = ai["01"];
  if (!gtin) return null;
  // GTIN-14: o 1º dígito é o indicador (9 = peso variável); o prefixo da empresa vem logo depois
  const profile = profiles.find(p => p.match.tipo === "gs1" && gtin.slice(1).startsWith(p.match.prefixo_gtin)) ?? null;
  const rules = profile?.rules ?? {};
  const warnings: string[] = [];

  let kg: number | null = null;
  const kgKey = Object.keys(ai).find(k => /^310\d$/.test(k));
  const lbKey = Object.keys(ai).find(k => /^320\d$/.test(k));
  if (kgKey) kg = Number(ai[kgKey]) / 10 ** Number(kgKey[3]);
  else if (lbKey) kg = Math.round((Number(ai[lbKey]) / 10 ** Number(lbKey[3])) * 0.45359237 * 1000) / 1000;

  const base = yymmdd(ai["13"]) ?? yymmdd(ai["11"]);
  let useBy = yymmdd(ai["17"]) ?? yymmdd(ai["15"]);
  if (!useBy && base && rules.shelf_dias) useBy = new Date(base.getTime() + rules.shelf_dias * 864e5);

  if (!profile) warnings.push("Fornecedor sem perfil de etiqueta. Cadastre para calcular validade e lote.");
  checkWeight(rules, kg, warnings);

  const missing: Reading["missing"] = [];
  if (kg == null) missing.push("peso");
  if (!useBy) missing.push("validade");
  if (!ai["21"]) missing.push("serial");

  return {
    productKey: gtin,
    supplierId: profile?.supplier_id ?? null,
    supplierName: profile?.supplier_name ?? null,
    profileId: profile?.id ?? null,
    netWeightKg: kg,
    packedOn: iso(base),
    useBy: iso(useBy),
    lot: lotFromRule(rules, base, ai["10"]),
    serial: ai["21"] ?? null,
    raw,
    missing,
    warnings,
  };
}

function readMolde(raw: string, others: string[], profiles: LabelProfile[]): Reading | null {
  const code = raw.trim().replace(/^\][A-Za-z]\d/, "");
  for (const p of profiles) {
    if (p.match.tipo !== "molde") continue;
    const m = p.match;
    if (!new RegExp(m.padrao).test(code)) continue;
    const productCode = code.slice(m.produto[0], m.produto[1]);
    const kg = Number(code.slice(m.peso[0], m.peso[1])) / 10 ** m.casas;
    let serial: string | null = null;
    if (m.serial_itf) {
      const itf = others.map(o => o.trim()).find(o => o !== code && /^\d{10}$/.test(o));
      if (itf) serial = itf.slice(1, -1); // tira o dígito inicial e o verificador
    }
    const warnings: string[] = [];
    checkWeight(p.rules, kg, warnings);
    const missing: Reading["missing"] = ["validade"];
    if (m.serial_itf && !serial) missing.push("serial");
    return {
      productKey: `${m.chave}:${productCode}`,
      supplierId: p.supplier_id,
      supplierName: p.supplier_name,
      profileId: p.id,
      netWeightKg: kg,
      packedOn: null,
      useBy: null,
      lot: null,
      serial,
      raw: code,
      missing,
      warnings,
    };
  }
  return null;
}

/** Recebe todos os códigos vistos na etiqueta e devolve a leitura, ou null se nenhum for reconhecido. */
export function readLabel(codes: string[], profiles: LabelProfile[]): Reading | null {
  const unique = [...new Set(codes.map(c => c.trim()).filter(Boolean))];
  for (const c of unique) {
    const r = readGs1(c, profiles);
    if (r) return r;
  }
  for (const c of unique) {
    const r = readMolde(c, unique, profiles);
    if (r) return r;
  }
  return null;
}

/** Um código de 10 dígitos que completa o serial de uma leitura por molde já aberta. */
export function serialFromSecondCode(code: string, reading: Reading): string | null {
  if (!reading.missing.includes("serial")) return null;
  const c = code.trim();
  return /^\d{10}$/.test(c) && c !== reading.raw ? c.slice(1, -1) : null;
}

export function daysUntil(isoDate: string | null, today = new Date()): number | null {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  const t0 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - t0) / 864e5);
}
