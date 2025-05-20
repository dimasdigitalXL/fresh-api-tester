// src/api-tester/core/structureAnalyzer.ts

import { existsSync } from "https://deno.land/std@0.216.0/fs/mod.ts";
import { compareStructures } from "./compareStructures.ts";
import { kvInstance } from "./kv.ts";
import type { Diff, Schema } from "./types.ts";

/**
 * Wandelt beliebige JSON-Werte in ein abstraktes Schema-Modell um:
 * - Strings → "string"
 * - Zahlen → 0
 * - Arrays → map auf erstes Element
 * - Objekte → rekursiv
 */
export function transformValues(value: unknown): unknown {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return 0;
  if (Array.isArray(value)) {
    return (value.length > 0) ? [transformValues(value[0])] : [];
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
  const entry = await kvInstance.get<Schema>(["expected", key]);
  if (entry.value) {
    console.debug(`✔️ Schema für "${key}" aus KV geladen.`);
    return entry.value;
  }
  if (existsSync(fsPath)) {
    const raw = await Deno.readTextFile(fsPath);
    console.debug(`✔️ Schema für "${key}" aus FS (${fsPath}) geladen.`);
    return JSON.parse(raw) as Schema;
  }
  throw new Error(`Erwartetes Schema nicht gefunden (KV & FS): ${key}`);
}

/**
 * Speichert das Schema in FS, bei Fehlern fallback auf KV.
 */
export async function saveUpdatedSchema(
  key: string,
  fsPath: string,
  schema: Schema,
): Promise<void> {
  try {
    await Deno.writeTextFile(fsPath, JSON.stringify(schema, null, 2) + "\n");
    console.info(`✅ Schema für "${key}" in FS gespeichert (${fsPath}).`);
  } catch (err) {
    console.warn(
      `⚠️ FS-Schreibfehler bei ${fsPath}: ${err}. Fallback auf KV.`,
    );
    await kvInstance.set(["expected", key], schema);
    console.info(`✅ Schema für "${key}" in KV gespeichert.`);
  }
}

/**
 * Vergleicht das geladene Schema mit der aktuellen Antwort.
 *
 * - Rein typ-bezogene Abweichungen: sofort in FS/KV speichern.
 * - Fehlende/zusätzliche Felder: erst nach Slack-PIN-Verifizierung.
 */
export async function analyzeResponse(
  key: string,
  fsPath: string,
  actualResponse: unknown,
): Promise<Diff> {
  // 1) Schema laden
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
    console.info(`❗️ Struktur-Änderung "${key}":`);
    console.info(`   Fehlende Felder:    ${missingFields.join(", ")}`);
    console.info(`   Zusätzliche Felder: ${extraFields.join(", ")}`);
    // kompletter aktualisierter Entwurf als pending ablegen
    await kvInstance.set(["schema-update-pending", key], actualSchema);
    console.info(
      `   Schema-Änderung für "${key}" ist jetzt in KV unter ` +
        `["schema-update-pending", "${key}"] gespeichert und wartet auf PIN.`,
    );
  } // 4b) Rein typ-bezogene Abweichungen → sofort übernehmen
  else if (typeMismatches.length > 0) {
    console.debug(
      `🔄 Typ-Abweichungen für "${key}" (count=${typeMismatches.length}) erkannt.`,
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
