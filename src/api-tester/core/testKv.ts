// src/api-tester/core/testKv.ts

import { kvInstance as kv } from "./kv.ts";

/**
 * Führt einen einfachen Test für das Deno-KV-System durch:
 * 1) Speichert einen Testwert unter dem Key ["test", "key"].
 * 2) Liest den Wert anschließend wieder aus und loggt ihn.
 */
export async function testKv(): Promise<void> {
  const key = ["test", "key"] as const;
  const value = "testValue";

  try {
    // 1) Speichern
    await kv.set(key, value);
    console.log(`✅ Testwert gespeichert: ${key.join(".")} = "${value}"`);
  } catch (err) {
    console.error(`❌ Fehler beim Speichern von ${key.join(".")}:`, err);
    return;
  }

  try {
    // 2) Auslesen
    const entry = await kv.get<string>(key);
    if (entry.value === undefined) {
      console.warn(`⚠️ Kein Eintrag gefunden unter ${key.join(".")}`);
    } else {
      console.log(
        `✅ Testwert abgerufen: ${key.join(".")} = "${entry.value}"`,
      );
    }
  } catch (err) {
    console.error(`❌ Fehler beim Auslesen von ${key.join(".")}:`, err);
  }
}

// Direkt ausführen, wenn diese Datei per `deno run` geladen wird
if (import.meta.main) {
  await testKv();
}
