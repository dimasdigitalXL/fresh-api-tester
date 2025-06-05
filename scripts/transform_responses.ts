// scripts/transform_responses.ts

import { join } from "https://deno.land/std@0.216.0/path/mod.ts";
import { ensureDir, existsSync } from "https://deno.land/std@0.216.0/fs/mod.ts";
import { transformValues } from "../src/api-tester/core/structureAnalyzer.ts"; // Importieren der transformValues-Funktion

const responsesDir = "./src/api-tester/responses"; // Verzeichnis mit den JSON-Antworten
const expectedDir = "./src/expected"; // Zielverzeichnis für die transformierten JSON-Dateien

// Funktion zum Verarbeiten und Speichern der Dateien
async function processFiles() {
  // Überprüfe, ob das Zielverzeichnis existiert, andernfalls erstelle es
  if (!existsSync(expectedDir)) {
    await ensureDir(expectedDir);
  }

  // Liste der JSON-Dateien im responses-Verzeichnis
  for await (const entry of Deno.readDir(responsesDir)) {
    if (entry.isFile && entry.name.endsWith(".json")) {
      const filePath = join(responsesDir, entry.name);
      const expectedFilePath = join(expectedDir, entry.name);

      // Lese und parse die JSON-Datei
      try {
        const rawData = await Deno.readTextFile(filePath);
        const jsonData = JSON.parse(rawData);

        // Transformiere die Werte gemäß der Logik in transformValues
        const transformedData = transformValues(jsonData);

        // Speichere das transformierte JSON im Zielverzeichnis
        await Deno.writeTextFile(
          expectedFilePath,
          JSON.stringify(transformedData, null, 2),
        );
        console.log(`✅ Transformierte Datei gespeichert: ${expectedFilePath}`);
      } catch (err) {
        console.error(
          `❌ Fehler beim Verarbeiten der Datei ${filePath}: ${err}`,
        );
      }
    }
  }
}

// Hauptfunktion ausführen
processFiles().then(() => {
  console.log("Alle Dateien verarbeitet.");
}).catch((err) => {
  console.error("Fehler beim Verarbeiten der Dateien:", err);
});
