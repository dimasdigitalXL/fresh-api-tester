// src/api-tester/core/utils.ts
import {
  dirname,
  fromFileUrl,
  join,
} from "https://deno.land/std@0.216.0/path/mod.ts";

export function resolveProjectPath(...segments: string[]): string {
  const __dirname = dirname(fromFileUrl(import.meta.url));
  // springt nur EIN Level hoch: von core → src/api-tester
  return join(__dirname, "..", ...segments);
}
