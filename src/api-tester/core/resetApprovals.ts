// src/api-tester/core/resetApprovals.ts

import { resolveProjectPath } from "./utils.ts";

/**
 * Setzt nur die approval-Status zurück,
 * bewahrt jedoch den gecachten Block-Array unter __rawBlocks.
 */
export async function resetApprovals(): Promise<void> {
  // Pfad zu pending-approvals.json im Projekt
  const approvalsFile = resolveProjectPath(
    "api-tester",
    "pending-approvals.json",
  );

  try {
    // Datei einlesen und parsen
    const raw = await Deno.readTextFile(approvalsFile);
    const approvals = JSON.parse(raw) as Record<string, unknown>;

    // Block-Cache beibehalten
    const rawBlocks = approvals["__rawBlocks"] ?? {};

    // Neues Objekt erzeugen: __rawBlocks + alle Keys auf "waiting"
    const newApprovals: Record<string, unknown> = { __rawBlocks: rawBlocks };
    for (const key of Object.keys(approvals)) {
      if (key === "__rawBlocks") continue;
      newApprovals[key] = "waiting";
    }

    // Zurückschreiben
    const out = JSON.stringify(newApprovals, null, 2);
    await Deno.writeTextFile(approvalsFile, out);

    console.log("🔄 Reset der bisherigen Freigaben (resetApprovals)");
  } catch (_err) {
    // Wenn die Datei fehlt oder nicht gelesen werden kann
    console.warn(
      "⚠️ pending-approvals.json nicht gefunden oder nicht lesbar – übersprungen.",
    );
  }
}
