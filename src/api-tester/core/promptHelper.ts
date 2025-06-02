// src/api-tester/core/promptHelper.ts

/**
 * Fordert den Benutzer im Terminal auf, manuell einen String einzugeben.
 *
 * @param message - Die Nachricht, die dem Benutzer angezeigt wird (z.B. "Bitte ID angeben: ")
 * @returns Die eingegebene Zeile (ohne Zeilenumbruch)
 */
export async function promptUserForId(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // Prompt ausgeben
  await Deno.stdout.write(encoder.encode(message));

  // Buffer zum Einlesen (1 KB)
  const buf = new Uint8Array(1024);
  const bytesRead = await Deno.stdin.read(buf);
  if (!bytesRead) {
    // Keine Daten gelesen (EOF o.ä.)
    return "";
  }

  // Bytes in String umwandeln und nur Zeilenumbruch am Ende entfernen
  const input = decoder.decode(buf.subarray(0, bytesRead));
  return input.replace(/\r?\n$/, "");
}
