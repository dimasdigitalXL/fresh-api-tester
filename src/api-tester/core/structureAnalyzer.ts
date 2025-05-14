// src/api-tester/core/structureAnalyzer.ts

import { existsSync } from "https://deno.land/std@0.216.0/fs/mod.ts";
import { compareStructures } from "./compareStructures.ts";
import { resolveProjectPath } from "./utils.ts";

/**
 * Konvertiert verschachtelte API-Antwort in abstraktes Typmodell.
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
 * Gibt den nächsten Pfad zurück, unter dem die neue aktualisierte Struktur
 * gespeichert werden soll, z.B.
 * src/api-tester/expected/Get_View_Customer_updated_v3.json
 */
export function getNextUpdatedPath(baseName: string): string {
  // Hardcodierter Pfad für den Ordner "expected"
  const dir =
    "/Users/dimaswahyuasmoro/my-deno-project/api-tester-fresh/src/expected";

  // Verzeichnis erstellen, falls nicht vorhanden
  if (!existsSync(dir)) {
    Deno.mkdirSync(dir, { recursive: true });
  }

  // Liste der bestehenden *_updated*.json-Dateien
  const entries = Array.from(Deno.readDirSync(dir))
    .filter((e) => e.isFile)
    .map((e) => e.name);

  const basePattern = new RegExp(`^${baseName}_updated(?:_v(\\d+))?\\.json$`);
  const versions = entries
    .map((f) => {
      const m = f.match(basePattern);
      return m ? (m[1] ? parseInt(m[1], 10) : 0) : null;
    })
    .filter((v): v is number => v !== null);

  const nextVer = versions.length > 0 ? Math.max(...versions) + 1 : 0;
  const fileName = `${baseName}_updated${
    nextVer === 0 ? "" : `_v${nextVer}`
  }.json`;

  // Rückgabe des Hardcodierten Pfades für die Datei
  return `${dir}/${fileName}`;
}

/**
 * Liefert den Dateinamen der zuletzt generierten *_updated[_vX].json zurück,
 * z. B. "Get_View_Customer_updated_v3.json"
 */
export function getLatestUpdatedFile(baseName: string): string | null {
  const dir = resolveProjectPath("api-tester", "expected");
  if (!existsSync(dir)) return null;

  const entries = Array.from(Deno.readDirSync(dir))
    .filter((e) => e.isFile)
    .map((e) => e.name);

  const regex = new RegExp(`^${baseName}_updated(?:_v(\\d+))?\\.json$`);
  const matches = entries
    .map((file) => {
      const m = file.match(regex);
      return m ? { file, ver: m[1] ? parseInt(m[1], 10) : 0 } : null;
    })
    .filter((x): x is { file: string; ver: number } => x !== null)
    .sort((a, b) => b.ver - a.ver);

  return matches.length ? matches[0].file : null;
}

// Falls Du anderweitig compareStructures brauchst:
export { compareStructures };
