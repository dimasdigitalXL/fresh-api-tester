// src/api-tester/core/structureAnalyzer.ts

import { existsSync } from "https://deno.land/std@0.216.0/fs/mod.ts";
import { compareStructures } from "./compareStructures.ts";
import { kvInstance } from "./kv.ts";
import type { Diff, Schema } from "./types.ts";

/**
 * Wandelt beliebige JSON-Werte in ein abstraktes Schema-Modell um:
 * - Strings → "string"
 * - Zahlen → 0
 * - Arrays → nur erstes Element (als Repräsentant)
 * - Objekte → rekursiv
 */
export function transformValues(value: unknown): unknown {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return 0;
  if (Array.isArray(value)) {
    return value.length > 0 ? [transformValues(value[0])] : [];
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k in value as Record<string, unknown>) {
      out[k] = transformValues((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

/**
 * Lädt das erwartete Schema erst aus KV, sonst aus FS.
 */
export async function loadExpectedSchema(
  key: string,
  fsPath: string,
): Promise<Schema> {
  // 1) Versuch in KV
  const entry = await kvInstance.get<Schema>(["expected", key]);
  if (entry.value) {
    console.debug(`✔️ Schema für "${key}" aus KV geladen.`);
    return entry.value;
  }
  // 2) Fallback auf FS
  if (existsSync(fsPath)) {
    const raw = await Deno.readTextFile(fsPath);
    console.debug(`✔️ Schema für "${key}" aus FS geladen (${fsPath}).`);
    return JSON.parse(raw) as Schema;
  }
  throw new Error(`Erwartetes Schema nicht gefunden (KV & FS): ${key}`);
}

/**
 * Speichert das Schema:
 * - Auf Deploy: direkt in KV
 * - Lokal: zunächst ins FS, bei Fehlern Fallback auf KV
 */
export async function saveUpdatedSchema(
  key: string,
  fsPath: string,
  schema: Schema,
): Promise<void> {
  const isDeploy = Boolean(Deno.env.get("DENO_DEPLOYMENT_ID"));

  if (isDeploy) {
    // ► Deploy: nur KV
    try {
      await kvInstance.set(["expected", key], schema);
      console.info(`✅ [KV] Schema “${key}” gespeichert.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ [KV] Konnte Schema “${key}” nicht speichern: ${msg}`);
    }
  } else {
    // ► Lokal: FS mit KV-Fallback
    try {
      await Deno.writeTextFile(fsPath, JSON.stringify(schema, null, 2) + "\n");
      console.info(`✅ [FS] Schema “${key}” gespeichert (${fsPath}).`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `⚠️ FS-Schreibfehler bei Schema “${key}”: ${msg}. Fallback auf KV.`,
      );
      try {
        await kvInstance.set(["expected", key], schema);
        console.info(`✅ [KV] Schema “${key}” als Fallback gespeichert.`);
      } catch (err2: unknown) {
        const msg2 = err2 instanceof Error ? err2.message : String(err2);
        console.error(
          `❌ [KV] Fallback fehlgeschlagen für Schema “${key}”: ${msg2}`,
        );
      }
    }
  }
}

/**
 * Vergleicht das geladene Schema mit der aktuellen Antwort.
 *
 * - Fehlende/zusätzliche Felder → neuen Entwurf in KV unter ["schema-update-pending", key] ablegen
 * - Nur Typ-Abweichungen → sofort speichern (FS oder KV)
 * - Keine Abweichungen → nichts tun
 */
export async function analyzeResponse(
  key: string,
  fsPath: string,
  actualResponse: unknown,
): Promise<Diff> {
  // 1) Erwartetes Schema laden
  const expectedSchema = await loadExpectedSchema(key, fsPath);

  // 2) Aktuelles Schema erzeugen
  const actualSchema = transformValues(actualResponse) as Schema;

  // 3) Strukturen vergleichen
  const { missingFields, extraFields, typeMismatches } = compareStructures(
    expectedSchema,
    actualSchema,
  );

  // 4a) Fehlende oder zusätzliche Felder → pending
  if (missingFields.length > 0 || extraFields.length > 0) {
    console.info(`❗️ Struktur-Änderung "${key}" erkannt:`);
    console.info(`   Fehlende Felder:    ${missingFields.join(", ")}`);
    console.info(`   Zusätzliche Felder: ${extraFields.join(", ")}`);
    await kvInstance.set(["schema-update-pending", key], actualSchema);
    console.info(
      `🔒 Neuer Schema-Entwurf für "${key}" in KV unter ["schema-update-pending","${key}"] gespeichert.`,
    );
  } // 4b) Nur Typ-Abweichungen → sofort übernehmen
  else if (typeMismatches.length > 0) {
    console.debug(
      `🔄 Typ-Abweichungen (${typeMismatches.length}) für "${key}" – übernehme automatisch.`,
    );
    await saveUpdatedSchema(key, fsPath, actualSchema);
  } // 4c) Keine Abweichungen
  else {
    console.info(`✅ Keine Struktur-Abweichungen für "${key}".`);
  }

  return {
    missingFields,
    extraFields,
    typeMismatches,
    updatedSchema: actualSchema,
  };
}
