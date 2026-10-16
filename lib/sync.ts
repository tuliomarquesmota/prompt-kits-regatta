// Envia a fila de caixas para o servidor quando há conexão.
// Cada caixa tem um id gerado no celular, então reenviar após uma queda não duplica nada.
import { supabase } from "./supabase";
import { listPending, updatePending, markSent, type Catalog, type PendingBox } from "./offline-db";
import { daysUntil } from "./labels";

export type SyncResult = { sent: number; duplicates: number; noProduct: number; errors: number };

let running = false;

export async function syncPending(catalog: Catalog): Promise<SyncResult> {
  const result: SyncResult = { sent: 0, duplicates: 0, noProduct: 0, errors: 0 };
  if (running || !navigator.onLine) return result;
  running = true;
  try {
    const sb = supabase();
    const { data: session } = await sb.auth.getSession();
    if (!session.session) return result;

    const queue = (await listPending(catalog.org.id)).filter(b => b.state === "pendente" || b.state === "erro" || b.state === "sem_produto");
    const receipts = new Set<string>();

    for (const box of queue) {
      // Produto cadastrado depois da leitura? Tenta casar de novo com o catálogo atual.
      const productId = box.productId ?? catalog.products.find(p => p.gtin === box.reading.productKey)?.id ?? null;
      if (!productId) {
        await updatePending({ ...box, state: "sem_produto", error: "Produto não cadastrado para " + box.reading.productKey });
        result.noProduct++;
        continue;
      }

      if (!receipts.has(box.receiptId)) {
        const { error } = await sb.from("receipts")
          .upsert({ id: box.receiptId, org_id: box.orgId, received_by: session.session.user.id }, { onConflict: "id", ignoreDuplicates: true });
        if (error) { await fail(box, error.message); result.errors++; continue; }
        receipts.add(box.receiptId);
      }

      const r = box.reading;
      const expired = (daysUntil(r.useBy) ?? 0) < 0;
      const { error } = await sb.from("boxes").insert({
        id: box.id,
        org_id: box.orgId,
        product_id: productId,
        supplier_id: r.supplierId,
        receipt_id: box.receiptId,
        location_id: box.locationId,
        gtin: r.productKey,
        serial: r.serial,
        net_weight_kg: r.netWeightKg,
        lot: r.lot,
        packed_on: r.packedOn,
        use_by: r.useBy,
        status: expired ? "blocked" : "in_stock",
        raw_barcode: r.raw,
      });

      if (!error) { await markSent({ ...box, productId }); result.sent++; continue; }

      if (error.code === "23505") {
        // Conflito: ou esta caixa já foi enviada antes (mesmo id), ou outro celular já leu o mesmo serial.
        const { data: same } = await sb.from("boxes").select("id").eq("id", box.id).maybeSingle();
        if (same) { await markSent({ ...box, productId }); result.sent++; }
        else { await updatePending({ ...box, productId, state: "duplicada", error: "Esta caixa já está no stock (lida por outro aparelho)." }); result.duplicates++; }
        continue;
      }
      await fail(box, error.message); result.errors++;
    }
  } finally {
    running = false;
  }
  return result;
}

async function fail(box: PendingBox, message: string) {
  await updatePending({ ...box, state: "erro", error: message });
}
