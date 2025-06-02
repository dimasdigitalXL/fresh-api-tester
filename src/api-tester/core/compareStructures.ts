// src/api-tester/core/compareStructures.ts

export interface TypeMismatch {
  path: string;
  expected: string;
  actual: string;
}

export interface CompareResult {
  missingFields: string[];
  extraFields: string[];
  typeMismatches: TypeMismatch[];
}

/**
 * Vergleicht zwei JSON-Schemata (erwartet vs. aktuell).
 * - Arrays: jedes Element gegen das erste erwartete Element prüfen.
 *   Wenn das erwartete Array leer ist, werden alle aktuellen Indizes als extraFields markiert.
 * - Primitive: Typen vergleichen (string, number, null, boolean).
 * - Objekte: rekursiver Key-by-Key-Abgleich.
 *
 * @param expectedRaw Das erwartete Schema (z.B. transformValues-Output).
 * @param actualRaw   Das aktuelle Schema (z.B. transformValues(actualData)).
 * @returns           Ein Objekt mit Listen der fehlenden, zusätzlichen und typabweichenden Felder.
 */
export function compareStructures(
  expectedRaw: unknown,
  actualRaw: unknown,
): CompareResult {
  const missingFields: string[] = [];
  const extraFields: string[] = [];
  const typeMismatches: TypeMismatch[] = [];

  function recurse(expected: unknown, actual: unknown, path: string) {
    // 1) Array vs. Array
    const expIsArr = Array.isArray(expected);
    const actIsArr = Array.isArray(actual);
    if (expIsArr && actIsArr) {
      const expArr = expected as unknown[];
      const actArr = actual as unknown[];

      if (expArr.length > 0) {
        // Vergleich jedes aktuellen Elements mit dem ersten erwarteten Element
        for (let i = 0; i < actArr.length; i++) {
          recurse(expArr[0], actArr[i], `${path}[${i}]`);
        }
      } else {
        // Erwartetes Array ist leer → alle aktuellen Elemente als extra markieren
        for (let i = 0; i < actArr.length; i++) {
          const idxPath = `${path}[${i}]`;
          extraFields.push(idxPath);
        }
      }
      return;
    }

    // 2) Array ≠ non-Array → Typabweichung
    if (expIsArr !== actIsArr) {
      typeMismatches.push({
        path: path || "<root>",
        expected: expIsArr ? "array" : getType(expected),
        actual: actIsArr ? "array" : getType(actual),
      });
      return;
    }

    // 3) Primitive vs. Primitive
    const expIsPrim = expected === null || typeof expected !== "object";
    const actIsPrim = actual === null || typeof actual !== "object";
    if (expIsPrim && actIsPrim) {
      const expType = expected === null ? "null" : typeof expected;
      const actType = actual === null ? "null" : typeof actual;
      if (expType !== actType) {
        typeMismatches.push({
          path: path || "<root>",
          expected: expType,
          actual: actType,
        });
      }
      return;
    }

    // 4) Objekt vs. non-Objekt → Typabweichung
    const expIsObj = expected !== null && typeof expected === "object";
    const actIsObj = actual !== null && typeof actual === "object";
    if (expIsObj !== actIsObj) {
      typeMismatches.push({
        path: path || "<root>",
        expected: expIsObj ? "object" : getType(expected),
        actual: actIsObj ? "object" : getType(actual),
      });
      return;
    }

    // 5) Beide sind Objekte → rekursiver Key-Abgleich
    const expObj = expected as Record<string, unknown>;
    const actObj = actual as Record<string, unknown>;

    // 5a) Fehlende Keys (in expected, nicht in actual)
    for (const key of Object.keys(expObj)) {
      const subPath = path ? `${path}.${key}` : key;
      if (!(key in actObj)) {
        missingFields.push(subPath);
      } else {
        recurse(expObj[key], actObj[key], subPath);
      }
    }

    // 5b) Zusätzliche Keys (in actual, nicht in expected)
    for (const key of Object.keys(actObj)) {
      if (!(key in expObj)) {
        const subPath = path ? `${path}.${key}` : key;
        extraFields.push(subPath);
      }
    }
  }

  recurse(expectedRaw, actualRaw, "");
  return { missingFields, extraFields, typeMismatches };
}

/**
 * Hilfsfunktion, um den Typ eines Werts als String zu bekommen.
 * Beispiel: getType("foo") → "string", getType([1,2]) → "array"
 */
function getType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
