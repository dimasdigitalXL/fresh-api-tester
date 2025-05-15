// src/api-tester/core/structureAnalyzer.ts

import { existsSync } from "https://deno.land/std@0.216.0/fs/mod.ts";
import { compareStructures } from "./compareStructures.ts";
import { kvInstance } from "./kv.ts";
import type { Diff, Schema } from "./types.ts";

/**
 * Konvertiert verschachtelte API-Antwort in ein abstraktes Typmodell.
 * (Strings → "string", Zahlen → 0 usw.)
 */
export function transformValues(value: unknown): unknown {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return 0;
  if (Array.isArray(value)) return value.map(transformValues);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key in value as Record<string, unknown>) {
      result[key] = transformValues((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

/**
 * Lädt das erwartete Schema zunächst aus Deno KV,
 * falls vorhanden, sonst aus dem Dateisystem.
 */
export async function loadExpectedSchema(
  key: string,
  fsPath: string,
): Promise<Schema> {
  // 1) Versuch aus KV
  const entry = await kvInstance.get<Schema>(["expected", key]);
  if (entry.value) {
    return entry.value;
  }

  // 2) Fallback auf FS
  if (existsSync(fsPath)) {
    const raw = await Deno.readTextFile(fsPath);
    return JSON.parse(raw) as Schema;
  }

  throw new Error(`Erwartetes Schema nicht gefunden (KV & FS): ${key}`);
}

/**
 * Speichert das aktualisierte Schema zuerst ins Dateisystem.
 * Bei Schreibfehlern (z.B. readonly Deploy) schreibt es in KV.
 */
export async function saveUpdatedSchema(
  key: string,
  fsPath: string,
  schema: Schema,
): Promise<void> {
  try {
    await Deno.writeTextFile(fsPath, JSON.stringify(schema, null, 2));
  } catch (err) {
    console.warn(
      `⚠️ FS-Schreibfehler bei ${fsPath}: ${err}. Fallback auf KV.`,
    );
    await kvInstance.set(["expected", key], schema);
  }
}

/**
 * Vergleicht die tatsächliche API-Antwort mit dem erwarteten Schema.
 * Wenn Unterschiede gefunden werden, speichert es das neue Schema (FS oder KV).
 * Gibt alle Diffs plus das generierte `updatedSchema` zurück.
 */
export async function analyzeResponse(
  key: string,
  fsPath: string,
  actualResponse: unknown,
): Promise<Diff> {
  const expected = await loadExpectedSchema(key, fsPath);
  const { missingFields, extraFields, typeMismatches } = compareStructures(
    expected,
    actualResponse,
  );

  // Neues Schema komplett basierend auf der aktuellen Antwort
  const updatedSchema = transformValues(actualResponse) as Schema;

  if (
    missingFields.length > 0 ||
    extraFields.length > 0 ||
    typeMismatches.length > 0
  ) {
    await saveUpdatedSchema(key, fsPath, updatedSchema);
  }

  return { missingFields, extraFields, typeMismatches, updatedSchema };
}
