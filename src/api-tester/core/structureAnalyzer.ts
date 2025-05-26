// src/api-tester/core/structureAnalyzer.ts

import { existsSync } from "https://deno.land/std@0.216.0/fs/mod.ts";
import { compareStructures } from "./compareStructures.ts";
import { kvInstance } from "./kv.ts";
import type { Diff, Schema } from "./types.ts";

/**
 * Wandelt JSON-Werte in ein abstraktes Schema-Modell um:
 * - strings → "string"
 * - numbers → 0
 * - arrays → nur erstes Element als Repräsentant
 * - objects → rekursiv
 */
export function transformValues(value: unknown): unknown {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return 0;
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
 * Lädt das erwartete Schema zuerst aus KV, andernfalls aus dem Dateisystem.
 */
export async function loadExpectedSchema(
  key: string,
  fsPath: string,
): Promise<Schema> {
  // 1) Versuch aus KV
  try {
    const { value } = await kvInstance.get<Schema>(["expected", key]);
    if (value) {
      console.debug(`✔️ [KV] Schema "${key}" geladen.`);
      return value;
    }
  } catch (err) {
    console.warn(`⚠️ [KV] Fehler beim Schema-Laden für "${key}": ${err}`);
  }
  // 2) Fallback auf File-System
  if (existsSync(fsPath)) {
    const raw = await Deno.readTextFile(fsPath);
    console.debug(`✔️ [FS] Schema "${key}" geladen (${fsPath}).`);
    return JSON.parse(raw) as Schema;
  }
  throw new Error(`Erwartetes Schema nicht gefunden (KV & FS): ${key}`);
}

/**
 * Speichert das aktualisierte Schema ins FS (Versionierung handled extern),
 * und bei Schreibfehlern als Fallback in KV.
 */
export async function saveUpdatedSchema(
  key: string,
  fsPath: string,
  schema: Schema,
): Promise<void> {
  try {
    await Deno.writeTextFile(fsPath, JSON.stringify(schema, null, 2) + "\n");
    console.info(`✅ [FS] Schema "${key}" gespeichert (${fsPath}).`);
  } catch (err) {
    console.warn(
      `⚠️ [FS] Fehler beim Speichern von "${key}": ${err}. Fallback auf KV.`,
    );
    try {
      await kvInstance.set(["expected", key], schema);
      console.info(`✅ [KV] Schema "${key}" gespeichert.`);
    } catch (err2) {
      console.error(`❌ [KV] Fallback fehlgeschlagen für "${key}": ${err2}`);
    }
  }
}

/**
 * Vergleicht das geladene erwartete Schema mit der aktuellen Antwort:
 * - Bei fehlenden/zusätzlichen Feldern → entwirft neuen Schema-Entwurf in KV,
 * - Bei nur Typ-Abweichungen       → übernimmt automatisch (FS/KV),
 * - Bei keiner Abweichung         → keine Aktion.
 */
export async function analyzeResponse(
  key: string,
  fsPath: string,
  actualResponse: unknown,
): Promise<Diff> {
  // 1) Erwartetes Schema laden
  const expectedSchema = await loadExpectedSchema(key, fsPath);

  // 2) Aktuelles Schema ableiten
  const actualSchema = transformValues(actualResponse) as Schema;

  // 3) Strukturen vergleichen
  const { missingFields, extraFields, typeMismatches } = compareStructures(
    expectedSchema,
    actualSchema,
  );

  // 4) Je nach Ergebnis handeln
  if (missingFields.length > 0 || extraFields.length > 0) {
    console.info(
      `❗️ Schema-Drift für "${key}" erkannt: missing=${missingFields.length}, extra=${extraFields.length}`,
    );
    await kvInstance.set(["schema-update-pending", key], actualSchema);
  } else if (typeMismatches.length > 0) {
    console.debug(
      `⚠️ Typ-Abweichungen (${typeMismatches.length}) für "${key}" – übernehme automatisch.`,
    );
    await saveUpdatedSchema(key, fsPath, actualSchema);
  } else {
    console.info(`✅ Keine Struktur-Abweichungen für "${key}".`);
  }

  return {
    missingFields,
    extraFields,
    typeMismatches,
    updatedSchema: actualSchema,
  };
}
