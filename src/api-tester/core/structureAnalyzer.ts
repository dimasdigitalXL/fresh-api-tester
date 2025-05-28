// src/api-tester/core/structureAnalyzer.ts

import { existsSync } from "https://deno.land/std@0.216.0/fs/mod.ts";
import { compareStructures } from "./compareStructures.ts";
import { kvInstance } from "./kv.ts";
import type { Diff, Schema } from "./types.ts";

/**
 * Wandelt JSON-Werte in ein abstraktes Schema um.
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

export async function loadExpectedSchema(
  key: string,
  fsPath: string,
): Promise<Schema> {
  // 1) KV
  try {
    const { value } = await kvInstance.get<Schema>(["expected", key]);
    if (value) return value;
  } catch {
    // ignore
  }
  // 2) File
  if (existsSync(fsPath)) {
    const raw = await Deno.readTextFile(fsPath);
    return JSON.parse(raw) as Schema;
  }
  throw new Error(`Schema nicht gefunden: ${key}`);
}

export async function saveUpdatedSchema(
  key: string,
  fsPath: string,
  schema: Schema,
): Promise<void> {
  try {
    await Deno.writeTextFile(fsPath, JSON.stringify(schema, null, 2) + "\n");
  } catch {
    await kvInstance.set(["expected", key], schema);
  }
}

export async function analyzeResponse(
  key: string,
  fsPath: string,
  actualResponse: unknown,
): Promise<Diff & { filename?: string }> {
  const expectedSchema = await loadExpectedSchema(key, fsPath);
  const actualSchema = transformValues(actualResponse) as Schema;
  const { missingFields, extraFields, typeMismatches } = compareStructures(
    expectedSchema,
    actualSchema,
  );

  if (missingFields.length > 0 || extraFields.length > 0) {
    await kvInstance.set(["schema-update-pending", key], actualSchema);
  } else if (typeMismatches.length > 0) {
    await saveUpdatedSchema(key, fsPath, actualSchema);
  }

  return {
    missingFields,
    extraFields,
    typeMismatches,
    updatedSchema: actualSchema,
  };
}
