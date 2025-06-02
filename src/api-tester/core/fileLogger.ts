// src/api-tester/core/fileLogger.ts

import { ensureDir } from "https://deno.land/std@0.216.0/fs/mod.ts";
import {
  dirname,
  fromFileUrl,
  join,
} from "https://deno.land/std@0.216.0/path/mod.ts";

/**
 * Ermittle das Verzeichnis dieser Datei.
 */
const __dirname = dirname(fromFileUrl(import.meta.url));

/**
 * Schreibt eine generische Log-Nachricht mit Zeitstempel in die angegebene Datei.
 * Legt bei Bedarf das Verzeichnis und die Datei an.
 *
 * @param filename Der Dateiname, z. B. "custom.log"
 * @param message  Die Lognachricht, die protokolliert werden soll
 */
export async function logToFile(
  filename: string,
  message: string,
): Promise<void> {
  try {
    const logDir = join(__dirname, "..", "logs");
    await ensureDir(logDir);

    const logPath = join(logDir, filename);
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] ${message}\n`;

    await Deno.writeTextFile(logPath, entry, { append: true });
  } catch (err) {
    console.error(
      "❌ Fehler beim Schreiben in log Datei:",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Schreibt eine Fehlermeldung in "errors.log".
 *
 * @param endpointName  Der Name des API-Endpunkts, an dem der Fehler aufgetreten ist
 * @param errorMessage  Die Fehlermeldung
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
 * Schreibt erkannte Strukturunterschiede in "differences.log".
 * Wird nur aktiv, wenn Unterschiede vorhanden sind.
 *
 * @param endpointName   Der Name des betroffenen API-Endpunkts
 * @param differences    Liste von Unterschiedsbeschreibungen, z. B. ["field1 fehlt", "field2 extra"]
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
      differences.join(
        "\n",
      )
    }\n\n`;

    await Deno.writeTextFile(logPath, entry, { append: true });
  } catch (err) {
    console.error(
      "❌ Fehler beim Schreiben in differences.log:",
      err instanceof Error ? err.message : err,
    );
  }
}
