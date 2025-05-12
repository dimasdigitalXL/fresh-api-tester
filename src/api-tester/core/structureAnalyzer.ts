// src/api-tester/core/structureAnalyzer.ts

import { existsSync } from "https://deno.land/std@0.216.0/fs/mod.ts";
import { compareStructures } from "./compareStructures.ts";
import { resolveProjectPath } from "./utils.ts";

export function transformValues(value: unknown): unknown {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return 0;
  if (Array.isArray(value)) return value.map(transformValues);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k in value as Record<string, unknown>) {
      out[k] = transformValues((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

export function getNextUpdatedPath(baseName: string): string {
  // nur noch "expected"
  const dir = resolveProjectPath("expected");
  if (!existsSync(dir)) Deno.mkdirSync(dir, { recursive: true });

  const entries = Array.from(Deno.readDirSync(dir))
    .filter((e) => e.isFile).map((e) => e.name);

  const pattern = new RegExp(`^${baseName}_updated(?:_v(\\d+))?\\.json$`);
  const versions = entries
    .map((f) => {
      const m = f.match(pattern);
      return m ? (m[1] ? parseInt(m[1]) : 0) : null;
    })
    .filter((v): v is number => v !== null);

  const nextVer = versions.length ? Math.max(...versions) + 1 : 0;
  const fileName = `${baseName}_updated${nextVer ? `_v${nextVer}` : ""}.json`;

  return resolveProjectPath("expected", fileName);
}

export function getLatestUpdatedFile(baseName: string): string | null {
  const dir = resolveProjectPath("expected");
  if (!existsSync(dir)) return null;

  const entries = Array.from(Deno.readDirSync(dir))
    .filter((e) => e.isFile).map((e) => e.name);

  const regex = new RegExp(`^${baseName}_updated(?:_v(\\d+))?\\.json$`);
  const matches = entries
    .map((f) => {
      const m = f.match(regex);
      return m ? { file: f, ver: m[1] ? parseInt(m[1]) : 0 } : null;
    })
    .filter((x): x is { file: string; ver: number } => x !== null)
    .sort((a, b) => b.ver - a.ver);

  return matches.length ? matches[0].file : null;
}

// Fresh‐kompatibel exportieren
export { compareStructures };
