// src/api-tester/core/kv.ts

/**
 * KV-Instance für Tests und Deploy:
 * - In Deno Deploy: globalThis.KV
 * - Lokal (mit --unstable-kv): Deno.openKv()
 * - CI / SKIP_KV: In-Memory-Stub
 */

declare global {
  var KV: Deno.Kv; // in Deno Deploy verfügbar
}

// Minimaler In-Memory-KV-Stub für CI oder SKIP_KV=true
function createInMemoryKv(): Deno.Kv {
  const store = new Map<string, unknown>();
  const toKey = (key: Deno.KvKey) => (key as string[]).join("::");

  return {
    get<T>(key: Deno.KvKey) {
      const k = toKey(key);
      return Promise.resolve({
        key,
        value: store.get(k) as T,
        versionstamp: "",
      });
    },
    set(key: Deno.KvKey, value: unknown) {
      store.set(toKey(key), value);
      return Promise.resolve({ key, versionstamp: "" });
    },
    delete(key: Deno.KvKey) {
      store.delete(toKey(key));
      return Promise.resolve({ key, versionstamp: "" });
    },
    list<T>(_opts?: unknown) {
      async function* gen() {/* leer */}
      return gen();
    },
    getMany(keys: Deno.KvKey[]) {
      return Promise.resolve(
        keys.map((key) => ({ key, value: store.get(toKey(key)) })),
      );
    },
    atomic() {
      throw new Error("KV.atomic() nicht implementiert im Stub");
    },
    enqueue() {
      return Promise.reject(
        new Error("KV.enqueue() nicht implementiert im Stub"),
      );
    },
    listenQueue() {
      throw new Error("KV.listenQueue() nicht implementiert im Stub");
    },
    restore() {
      return Promise.resolve();
    },
    transaction() {
      return Promise.reject(
        new Error("KV.transaction() nicht implementiert im Stub"),
      );
    },
  } as unknown as Deno.Kv;
}

let kv: Deno.Kv;

if (Deno.env.get("CI") === "true" || Deno.env.get("SKIP_KV") === "true") {
  console.warn("⚠️ SKIP_KV/CI erkannt – verwende In-Memory KV-Stub");
  kv = createInMemoryKv();
} else if (typeof globalThis.KV !== "undefined") {
  // Deno Deploy
  kv = globalThis.KV;
} else if (typeof Deno.openKv === "function") {
  // Lokal mit --unstable-kv
  kv = await Deno.openKv();
} else {
  throw new Error(
    "Deno KV nicht verfügbar – bitte mit --unstable-kv starten oder SKIP_KV=true setzen.",
  );
}

export const kvInstance = kv;
