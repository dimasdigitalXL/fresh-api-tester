// src/api-tester/core/structureAnalyzer.ts

import { existsSync } from "https://deno.land/std@0.216.0/fs/mod.ts";
import { compareStructures } from "./compareStructures.ts";
import { kvInstance } from "./kv.ts";
import type { Diff, Schema } from "./types.ts";

/**
 * Wandelt JSON-Werte in ein abstraktes Schema um.
 * - Strings werden zu "string"
 * - Zahlen zu 0
 * - Arrays werden auf ihr erstes Element abgebildet (rekursiv)
 * - Objekte werden rekursiv transformiert
 * - Andere Werte (boolean, null) bleiben unverändert
 */
export function transformValues(value: unknown): unknown {
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "number") {
    return 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? [transformValues(value[0])] : [];
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = transformValues(v);
    }
    return out;
  }
  return value;
}

/**
 * Lädt das erwartete Schema entweder aus KV oder aus dem Dateisystem.
 * @param key     Eindeutiger Key, typischerweise der Endpoint-Name (ohne Leerzeichen)
 * @param fsPath  Pfad zur Schema-Datei im Dateisystem
 * @returns       Das geladene Schema (JSON-Objekt)
 * @throws        Error, wenn weder in KV noch als Datei gefunden
 */
export async function loadExpectedSchema(
  key: string,
  fsPath: string,
): Promise<Schema> {
  // 1) Versuch: aus KV laden
  try {
    const { value } = await kvInstance.get<Schema>(["expected", key]);
    if (value) {
      console.debug(`🔍 Erwartetes Schema für "${key}" aus KV geladen.`);
      return value;
    }
  } catch {
    // KV-Fehler ignorieren und weitermachen
  }

  // 2) Versuch: aus Dateisystem laden
  if (existsSync(fsPath)) {
    try {
      const raw = await Deno.readTextFile(fsPath);
      const parsed = JSON.parse(raw) as Schema;
      console.debug(
        `🔍 Erwartetes Schema für "${key}" aus Datei "${fsPath}" geladen.`,
      );
      return parsed;
    } catch (err) {
      throw new Error(`Fehler beim Parsen des Schemas "${fsPath}": ${err}`);
    }
  }

  // 3) Wenn beides fehlgeschlagen ist, werfen
  throw new Error(`Schema nicht gefunden: ${key} (Pfad: ${fsPath})`);
}

/**
 * Speichert das aktualisierte Schema entweder ins Dateisystem oder (bei Fehlern) in KV.
 * @param key     Eindeutiger Key (Endpoint-Name)
 * @param fsPath  Pfad zur Schema-Datei im Dateisystem
 * @param schema  Das zu speichernde Schema-Objekt
 */
export async function saveUpdatedSchema(
  key: string,
  fsPath: string,
  schema: Schema,
): Promise<void> {
  const serialized = JSON.stringify(schema, null, 2) + "\n";
  try {
    // Versuch: direkt ins Dateisystem schreiben
    await Deno.writeTextFile(fsPath, serialized);
    console.log(
      `✅ Aktualisiertes Schema für "${key}" in Datei "${fsPath}" gespeichert.`,
    );
  } catch (err) {
    // Wenn Datei-Schreibfehler, dann in KV speichern
    try {
      await kvInstance.set(["expected", key], schema);
      console.warn(
        `⚠️ Konnte Schema "${fsPath}" nicht schreiben (Error: ${err}). In KV zwischengespeichert.`,
      );
    } catch (kvErr) {
      console.error(
        `❌ Konnte Schema weder in Datei "${fsPath}" noch in KV speichern: ${kvErr}`,
      );
    }
  }
}

/**
 * Vergleicht die tatsächliche Antwort (actualResponse) mit dem erwarteten Schema und
 * entscheidet, ob ein Schema-Update (pending oder direkt gespeichert) notwendig ist.
 *
 * - Lädt erwartetes Schema über loadExpectedSchema()
 * - Transformiert actualResponse nach transformValues()
 * - Vergleicht Strukturen via compareStructures()
 * - Wenn missingFields oder extraFields > 0 → speichert actualSchema unter "schema-update-pending"
 * - Wenn nur typeMismatches vorhanden, speichert direkt via saveUpdatedSchema()
 *
 * @param key             Eindeutiger Key (Endpoint-Name ohne Leerzeichen)
 * @param fsPath          Pfad zur erwarteten Schema-Datei
 * @param actualResponse  Der rohe JSON-Body der API-Antwort
 * @returns               Objekt mit missingFields, extraFields, typeMismatches und updatedSchema
 */
export async function analyzeResponse(
  key: string,
  fsPath: string,
  actualResponse: unknown,
): Promise<Diff & { filename?: string }> {
  // 1) Erwartetes Schema laden
  const expectedSchema = await loadExpectedSchema(key, fsPath);

  // 2) Tatsächliche Antwort in ein Schema transformieren
  const actualSchema = transformValues(actualResponse) as Schema;

  // 3) Strukturen vergleichen
  const { missingFields, extraFields, typeMismatches } = compareStructures(
    expectedSchema,
    actualSchema,
  );

  // 4) Wenn Felder fehlen oder zusätzlich sind, in KV als Pending markieren
  if (missingFields.length > 0 || extraFields.length > 0) {
    try {
      await kvInstance.set(["schema-update-pending", key], actualSchema);
      console.warn(
        `🕒 Schema-Drift für "${key}" erkannt: ` +
          `${missingFields.length} fehlende, ${extraFields.length} neue Felder.`,
      );
    } catch (err) {
      console.error(
        `❌ Konnte Pending-Schema unter ["schema-update-pending","${key}"] nicht speichern: ${err}`,
      );
    }
  } // 5) Wenn nur Typ-Abweichungen vorliegen, direkt ins Dateisystem / KV schreiben
  else if (typeMismatches.length > 0) {
    console.warn(
      `⚠️ Nur Typabweichungen für "${key}" (${typeMismatches.length}): Speichere aktualisiertes Schema.`,
    );
    await saveUpdatedSchema(key, fsPath, actualSchema);
  }

  // 6) Ergebnis zurückgeben
  return {
    missingFields,
    extraFields,
    typeMismatches,
    updatedSchema: actualSchema,
  };
}
