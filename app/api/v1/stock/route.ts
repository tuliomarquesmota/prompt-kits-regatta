// API de stock para os sites (substitui a consulta que o site da SA faz hoje ao SOS Inventory).
// GET /api/v1/stock   com o cabeçalho  x-api-key: lote_…
// Devolve só caixas em stock e dentro da validade.
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "x-api-key, content-type",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function GET(req: Request) {
  const key = req.headers.get("x-api-key");
  if (!key) return Response.json({ error: "Envie a chave no cabeçalho x-api-key." }, { status: 401, headers: cors });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon)
    return Response.json({ error: "Servidor sem configuração do Supabase." }, { status: 500, headers: cors });

  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("public_stock", { api_key: key });
  if (error) {
    const invalid = error.code === "28000";
    return Response.json(
      { error: invalid ? "Chave inválida ou revogada." : "Erro ao consultar o stock." },
      { status: invalid ? 401 : 500, headers: cors },
    );
  }

  type Row = {
    product: string;
    sku: string | null;
    gtin: string | null;
    boxes: number;
    total_kg: number;
    next_use_by: string | null;
  };
  const products = (data as Row[]).map(r => ({
    product: r.product,
    sku: r.sku,
    gtin: r.gtin,
    in_stock: Number(r.boxes) > 0,
    boxes: Number(r.boxes),
    total_kg: Number(r.total_kg),
    next_use_by: r.next_use_by,
  }));

  return Response.json(
    { updated_at: new Date().toISOString(), products },
    { headers: { ...cors, "Cache-Control": "no-store" } },
  );
}
