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
    // get<T> muss ein KvEntry<T> zurückliefern, value: T
    get<T>(key: Deno.KvKey): Promise<Deno.KvEntry<T>> {
      const k = toKey(key);
      const v = store.get(k) as T;
      return Promise.resolve({
        key,
        value: v as T,
        versionstamp: "",
      });
    },

    // set() muss KvEntry<void> zurückliefern, value: void (undefined)
    set(key: Deno.KvKey, _value: unknown): Promise<Deno.KvEntry<void>> {
      store.set(toKey(key), _value);
      return Promise.resolve({
        key,
        value: undefined,
        versionstamp: "",
      });
    },

    // delete() ebenfalls KvEntry<void>
    delete(key: Deno.KvKey): Promise<Deno.KvEntry<void>> {
      store.delete(toKey(key));
      return Promise.resolve({
        key,
        value: undefined,
        versionstamp: "",
      });
    },

    // list<T> gibt ein AsyncIterable<Deno.KvEntry<T>> zurück (hier leer)
    list<T>(_opts?: unknown): AsyncIterable<Deno.KvEntry<T>> {
      async function* gen(): AsyncGenerator<Deno.KvEntry<T>> {
        // keine Einträge
      }
      return gen();
    },

    // getMany liefert für jeden Schlüssel ein KvEntry<T>, value: T
    getMany(keys: Deno.KvKey[]): Promise<Array<Deno.KvEntry<unknown>>> {
      const entries: Deno.KvEntry<unknown>[] = keys.map((key) => {
        const k = toKey(key);
        const v = store.get(k);
        return {
          key,
          value: v as unknown,
          versionstamp: "",
        };
      });
      return Promise.resolve(entries);
    },

    atomic() {
      throw new Error("KV.atomic() nicht implementiert im In-Memory-Stub");
    },
    enqueue() {
      return Promise.reject(
        new Error("KV.enqueue() nicht implementiert im In-Memory-Stub"),
      );
    },
    listenQueue() {
      throw new Error("KV.listenQueue() nicht implementiert im In-Memory-Stub");
    },
    restore() {
      return Promise.resolve();
    },
    transaction() {
      return Promise.reject(
        new Error("KV.transaction() nicht implementiert im In-Memory-Stub"),
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
