// src/api-tester/core/kv.ts

// Deno Deploy stellt globalThis.KV bereit
declare global {
  var KV: Deno.Kv;
}

/** Erstellt einen In-Memory-Stub, der die minimalen KV-Methoden implementiert */
function createInMemoryKv(): Deno.Kv {
  const store = new Map<string, unknown>();

  const kvStub = {
    get<T>(key: Deno.KvKey) {
      const composite = (key as unknown as string[]).join("::");
      return Promise.resolve({
        key,
        value: store.get(composite) as T,
        versionstamp: "",
      });
    },
    set(key: Deno.KvKey, value: unknown) {
      const composite = (key as unknown as string[]).join("::");
      store.set(composite, value);
      return Promise.resolve({ key, versionstamp: "" });
    },
    delete(key: Deno.KvKey) {
      const composite = (key as unknown as string[]).join("::");
      store.delete(composite);
      return Promise.resolve({ key, versionstamp: "" });
    },
    list<T>(_options?: Deno.KvListSelector) {
      async function* gen() {
        // kein Eintrag
      }
      return gen();
    },
    // Stub für weitere Methoden, damit der Type-Checker zufrieden ist
    getMany: (_keys: Deno.KvKey[]) => Promise.resolve([]),
    atomic: () => {
      throw new Error("atomic nicht implementiert");
    },
    enqueue: () => Promise.reject(new Error("enqueue nicht implementiert")),
    listenQueue: () => {
      throw new Error("listenQueue nicht implementiert");
    },
    restore: async () => {},
    transaction: (_fn: unknown) =>
      Promise.reject(new Error("transaction nicht implementiert")),
  };

  // Cast auf Deno.Kv via unknown
  return kvStub as unknown as Deno.Kv;
}

let _kv: Deno.Kv;

// Verwende In-Memory-Stub, wenn SKIP_KV oder CI gesetzt ist
if (Deno.env.get("SKIP_KV") === "true" || Deno.env.get("CI") === "true") {
  console.warn("⚠️ SKIP_KV/CI erkannt – verwende In-Memory KV-Stub");
  _kv = createInMemoryKv();

  // Auf Deno Deploy steht globalThis.KV zur Verfügung
} else if (typeof globalThis.KV !== "undefined") {
  _kv = globalThis.KV;

  // Lokal mit --unstable-kv
} else if (typeof Deno.openKv === "function") {
  _kv = await Deno.openKv();

  // Kein KV verfügbar → Fehler
} else {
  throw new Error(
    "Deno KV nicht verfügbar. Starte mit --unstable-kv oder setze SKIP_KV=true.",
  );
}

export const kvInstance = _kv;
