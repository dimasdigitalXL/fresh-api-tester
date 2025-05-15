// src/api-tester/core/testKv.ts

import { kvInstance as kv } from "./kv.ts";

export async function testKv() {
  const key = ["test", "key"] as const;
  const value = "testValue";

  // Speichern
  await kv.set(key, value);
  console.log(`✅ Testwert gespeichert: ${key.join(".")} = ${value}`);

  // Auslesen
  const entry = await kv.get<string>(key);
  console.log(
    `✅ Testwert abgerufen: ${key.join(".")} = ${entry.value ?? entry}`,
  );
}

// Direkt ausführen, wenn Datei per `deno run` geladen wird
if (import.meta.main) {
  await testKv();
}
