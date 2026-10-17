// Banco local do celular (IndexedDB). Guarda o catálogo para ler etiquetas offline
// e a fila de caixas lidas que ainda não chegaram ao servidor.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { LabelProfile, Reading } from "./labels";

export type Product = { id: string; name: string; gtin: string | null; supplier_id: string | null };
export type Location = { id: string; name: string };
export type Org = { id: string; name: string };

export type Catalog = {
  org: Org;
  profiles: LabelProfile[];
  products: Product[];
  locations: Location[];
  updatedAt: string;
};

export type PendingState = "pendente" | "enviando" | "duplicada" | "sem_produto" | "erro";

export type PendingBox = {
  id: string; // id da caixa, gerado no celular (o envio pode ser repetido sem duplicar)
  orgId: string;
  receiptId: string; // sessão de recebimento
  locationId: string | null;
  productId: string | null;
  reading: Reading;
  state: PendingState;
  error?: string;
  createdAt: string;
};

interface LoteDB extends DBSchema {
  catalog: { key: string; value: Catalog };
  pending: { key: string; value: PendingBox; indexes: { byOrg: string } };
  sent: { key: string; value: PendingBox & { sentAt: string }; indexes: { byReceipt: string } };
}

let dbp: Promise<IDBPDatabase<LoteDB>> | null = null;
function db() {
  if (!dbp) {
    dbp = openDB<LoteDB>("lote", 1, {
      upgrade(d) {
        d.createObjectStore("catalog");
        d.createObjectStore("pending", { keyPath: "id" }).createIndex("byOrg", "orgId");
        d.createObjectStore("sent", { keyPath: "id" }).createIndex("byReceipt", "receiptId");
      },
    });
  }
  return dbp;
}

export async function saveCatalog(c: Catalog) {
  await (await db()).put("catalog", c, c.org.id);
}
export async function loadCatalog(orgId: string) {
  return (await db()).get("catalog", orgId);
}

export async function queueBox(b: PendingBox) {
  await (await db()).put("pending", b);
}
export async function updatePending(b: PendingBox) {
  await (await db()).put("pending", b);
}
export async function listPending(orgId: string) {
  return (await db()).getAllFromIndex("pending", "byOrg", orgId);
}

export async function markSent(b: PendingBox) {
  const d = await db();
  const tx = d.transaction(["pending", "sent"], "readwrite");
  await tx.objectStore("sent").put({ ...b, state: "pendente", sentAt: new Date().toISOString() });
  await tx.objectStore("pending").delete(b.id);
  await tx.done;
}
export async function removePending(id: string) {
  await (await db()).delete("pending", id);
}
export async function listSent(receiptId: string) {
  return (await db()).getAllFromIndex("sent", "byReceipt", receiptId);
}

/** A mesma caixa já foi lida neste celular (na fila ou já enviada)? */
export async function seenOnDevice(productKey: string, serial: string | null): Promise<boolean> {
  if (!serial) return false;
  const d = await db();
  const all = [...(await d.getAll("pending")), ...(await d.getAll("sent"))];
  return all.some(b => b.reading.productKey === productKey && b.reading.serial === serial);
}
