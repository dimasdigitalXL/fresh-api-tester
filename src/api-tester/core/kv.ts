// src/api-tester/core/kv.ts

// 1) globalThis.KV als Deno.Kv bekannt machen
declare global {
  // Deno Deploy stellt globalThis.KV als Deno.Kv zur Verfügung
  var KV: Deno.Kv;
}

let _kv: Deno.Kv;

if (typeof globalThis.KV !== "undefined") {
  // Auf Deno Deploy
  _kv = globalThis.KV;
} else if (typeof Deno.openKv === "function") {
  // Lokal mit --unstable-kv
  _kv = await Deno.openKv();
} else {
  throw new Error(
    "Deno KV ist nicht verfügbar. Starte mit --unstable-kv oder deploye auf Deno Deploy.",
  );
}

export const kvInstance = _kv;
