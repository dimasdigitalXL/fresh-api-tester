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
 * Vergleicht zwei verschachtelte JSON-Strukturen (expected vs. actual).
 * Gibt Listen mit Abweichungen zurück:
 * - missingFields: Felder, die im actual fehlen
 * - extraFields: Felder, die im actual vorkommen, aber nicht im expected
 * - typeMismatches: Felder, die in beiden vorkommen, aber unterschiedlichen Typ haben
 *
 * @param expected - Erwartete Struktur (z. B. aus expected/*.json)
 * @param actual - Tatsächlich zurückgegebene API-Response (transformiert)
 * @param path - Interner Pfad für verschachtelte Felder (rekursiv genutzt)
 */
export function compareStructures(
  expected: unknown,
  actual: unknown,
  path = "",
): CompareResult {
  const missingFields: string[] = [];
  const extraFields: string[] = [];
  const typeMismatches: TypeMismatch[] = [];

  // Sonderfall: Arrays → vergleiche nur erstes Element
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length > 0 && actual.length > 0) {
      return compareStructures(expected[0], actual[0], path);
    }
    return { missingFields, extraFields, typeMismatches };
  }

  // Wenn einer der Werte kein Objekt ist (inkl. null) → Abbruch
  if (
    typeof expected !== "object" ||
    expected === null ||
    typeof actual !== "object" ||
    actual === null
  ) {
    return { missingFields, extraFields, typeMismatches };
  }

  // Jetzt sind both expected & actual non-null objects
  const expObj = expected as Record<string, unknown>;
  const actObj = actual as Record<string, unknown>;

  // 1. Fehlende Felder & Typabweichungen
  for (const key of Object.keys(expObj)) {
    const currentPath = path ? `${path}.${key}` : key;
    if (!(key in actObj)) {
      // komplett fehlt
      missingFields.push(currentPath);
    } else {
      const expVal = expObj[key];
      const actVal = actObj[key];
      // wenn beide Objekte (nicht Arrays) → rekursiv vergleichen
      if (
        typeof expVal === "object" &&
        expVal !== null &&
        !Array.isArray(expVal) &&
        typeof actVal === "object" &&
        actVal !== null &&
        !Array.isArray(actVal)
      ) {
        const sub = compareStructures(expVal, actVal, currentPath);
        missingFields.push(...sub.missingFields);
        extraFields.push(...sub.extraFields);
        typeMismatches.push(...sub.typeMismatches);
      } else if (typeof expVal !== typeof actVal) {
        // primitiver Typ mismatch
        typeMismatches.push({
          path: currentPath,
          expected: typeof expVal,
          actual: typeof actVal,
        });
      }
      // Arrays wurden oben behandelt
    }
  }

  // 2. Zusätzliche Felder in actual
  for (const key of Object.keys(actObj)) {
    if (!(key in expObj)) {
      const currentPath = path ? `${path}.${key}` : key;
      extraFields.push(currentPath);
    }
  }

  return { missingFields, extraFields, typeMismatches };
}
