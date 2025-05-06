// src/api-tester/core/fileLogger.ts

import { ensureDir } from "https://deno.land/std@0.177.0/fs/mod.ts";
import {
  dirname,
  fromFileUrl,
  join,
} from "https://deno.land/std@0.177.0/path/mod.ts";

/**
 * Ermittelt das Verzeichnis der aktuellen Datei.
 */
const __dirname = dirname(fromFileUrl(import.meta.url));

/**
 * Schreibt eine generische Log-Nachricht mit Zeitstempel in eine angegebene Datei.
 * Erstellt das Log-Verzeichnis und die Datei, falls sie nicht existieren.
 *
 * @param filename Der Dateiname, z. B. "custom.log"
 * @param message  Die Lognachricht
 */
export async function logToFile(
  filename: string,
  message: string,
): Promise<void> {
  const logDir = join(__dirname, "..", "logs");
  await ensureDir(logDir);
  const logPath = join(logDir, filename);
  const timestamp = new Date().toISOString();
  await Deno.writeTextFile(logPath, `[${timestamp}] ${message}\n`, {
    append: true,
  });
}

/**
 * Schreibt eine Fehlermeldung in die Datei "errors.log".
 * Wird z. B. verwendet bei HTTP-Fehlern oder Ausführungsfehlern.
 *
 * @param endpointName  Der Name des API-Endpunkts
 * @param errorMessage  Die konkrete Fehlermeldung
 */
export async function logError(
  endpointName: string,
  errorMessage: string,
): Promise<void> {
  try {
    const logDir = join(__dirname, "..", "logs");
    await ensureDir(logDir);
    const logPath = join(logDir, "errors.log");
    const timestamp = new Date().toISOString();
    const entry =
      `[${timestamp}] Fehler bei ${endpointName}: ${errorMessage}\n\n`;
    await Deno.writeTextFile(logPath, entry, { append: true });
  } catch (err) {
    console.error(
      "❌ Fehler beim Schreiben in errors.log:",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Schreibt erkannte Strukturunterschiede in die Datei "differences.log".
 * Wird z. B. aufgerufen, wenn Felder fehlen oder zusätzliche auftauchen.
 *
 * @param endpointName  Der API-Endpunkt
 * @param differences   Liste an Unterschieden als Strings
 */
export async function logDifferences(
  endpointName: string,
  differences: string[],
): Promise<void> {
  if (!differences || differences.length === 0) return;
  try {
    const logDir = join(__dirname, "..", "logs");
    await ensureDir(logDir);
    const logPath = join(logDir, "differences.log");
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] Unterschiede bei ${endpointName}:\n${
      differences.join("\n")
    }\n\n`;
    await Deno.writeTextFile(logPath, entry, { append: true });
  } catch (err) {
    console.error(
      "❌ Fehler beim Schreiben in differences.log:",
      err instanceof Error ? err.message : err,
    );
  }
}
