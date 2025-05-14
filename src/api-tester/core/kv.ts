// src/api-tester/core/kv.ts

// Wenn auf Deno Deploy gebunden, liegt ein globales KV vor.
// Lokaler Testfall: Deno.openKv()
declare global {
  // Binding-Name in Deno Deploy muss 'KV' sein
  var KV: Deno.Kv;
}

export const kvInstance: Deno.Kv = globalThis.KV ?? await Deno.openKv();
