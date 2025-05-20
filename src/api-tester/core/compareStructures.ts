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
 * Vergleicht zwei verschachtelte JSON-Strukturen (expected vs. actual),
 * behandelt Arrays, Objekte und primitive Typen.
 */
export function compareStructures(
  expectedRaw: unknown,
  actualRaw: unknown,
): CompareResult {
  const missingFields: string[] = [];
  const extraFields: string[] = [];
  const typeMismatches: TypeMismatch[] = [];

  function recurse(expected: unknown, actual: unknown, path: string) {
    // 1) Array vs. Array: prüfe jedes Element gegen expected[0]
    if (Array.isArray(expected) && Array.isArray(actual)) {
      if (expected.length > 0) {
        for (let i = 0; i < actual.length; i++) {
          recurse(expected[0], actual[i], `${path}[${i}]`);
        }
      }
      return;
    }

    // 2) Array vs. non-Array → Typabweichung
    if (Array.isArray(expected) !== Array.isArray(actual)) {
      typeMismatches.push({
        path: path || "<root>",
        expected: Array.isArray(expected) ? "array" : typeof expected,
        actual: Array.isArray(actual) ? "array" : typeof actual,
      });
      return;
    }

    // 3) Primitive vs. Primitive → Typvergleich
    const expIsPrimitive = expected === null || typeof expected !== "object";
    const actIsPrimitive = actual === null || typeof actual !== "object";
    if (expIsPrimitive && actIsPrimitive) {
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
    const expIsObj = typeof expected === "object" && expected !== null;
    const actIsObj = typeof actual === "object" && actual !== null;
    if (expIsObj !== actIsObj) {
      typeMismatches.push({
        path: path || "<root>",
        expected: expIsObj ? "object" : typeof expected,
        actual: actIsObj ? "object" : typeof actual,
      });
      return;
    }

    // 5) Beide sind nicht-null Objects → Key-by-Key-Vergleich
    const expObj = expected as Record<string, unknown>;
    const actObj = actual as Record<string, unknown>;

    // 5a) Fehlende Keys & Rekursion
    for (const key of Object.keys(expObj)) {
      const subPath = path ? `${path}.${key}` : key;
      if (!(key in actObj)) {
        missingFields.push(subPath);
      } else {
        recurse(expObj[key], actObj[key], subPath);
      }
    }

    // 5b) Zusätzliche Keys
    for (const key of Object.keys(actObj)) {
      const subPath = path ? `${path}.${key}` : key;
      if (!(key in expObj)) {
        extraFields.push(subPath);
      }
    }
  }

  recurse(expectedRaw, actualRaw, "");
  return { missingFields, extraFields, typeMismatches };
}
