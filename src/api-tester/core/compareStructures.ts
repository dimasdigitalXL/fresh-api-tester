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
 * Meldet:
 * - missingFields: Felder, die im actual fehlen
 * - extraFields: Felder, die im actual extra sind
 * - typeMismatches: Felder mit falschem Typ (inkl. null vs. string etc.)
 */
export function compareStructures(
  expected: unknown,
  actual: unknown,
  path = "",
): CompareResult {
  const missingFields: string[] = [];
  const extraFields: string[] = [];
  const typeMismatches: TypeMismatch[] = [];

  // 1) Arrays: vergleiche nur das erste Element
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length > 0 && actual.length > 0) {
      return compareStructures(expected[0], actual[0], path);
    }
    return { missingFields, extraFields, typeMismatches };
  }

  // 2) Array vs. Kein Array → Typabweichung
  if (Array.isArray(expected) && !Array.isArray(actual)) {
    typeMismatches.push({
      path: path || "<root>",
      expected: "array",
      actual: typeof actual,
    });
    return { missingFields, extraFields, typeMismatches };
  }
  if (!Array.isArray(expected) && Array.isArray(actual)) {
    typeMismatches.push({
      path: path || "<root>",
      expected: typeof expected,
      actual: "array",
    });
    return { missingFields, extraFields, typeMismatches };
  }

  // 3) Primitive (inkl. null) vs. Primitive → Typvergleich
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
    return { missingFields, extraFields, typeMismatches };
  }

  // 4) Objekt vs. non-Objekt → Typabweichung (falls eines Objekt, anderes nicht)
  const expIsObj = typeof expected === "object" && expected !== null;
  const actIsObj = typeof actual === "object" && actual !== null;
  if (expIsObj && !actIsObj) {
    typeMismatches.push({
      path: path || "<root>",
      expected: "object",
      actual: Array.isArray(actual) ? "array" : typeof actual,
    });
    return { missingFields, extraFields, typeMismatches };
  }
  if (!expIsObj && actIsObj) {
    typeMismatches.push({
      path: path || "<root>",
      expected: Array.isArray(expected) ? "array" : typeof expected,
      actual: "object",
    });
    return { missingFields, extraFields, typeMismatches };
  }

  // 5) Jetzt sind beide non-null Objects
  const expObj = expected as Record<string, unknown>;
  const actObj = actual as Record<string, unknown>;

  // 5a) Fehlende Felder & Typabweichungen in gemeinsamen Feldern
  for (const key of Object.keys(expObj)) {
    const currentPath = path ? `${path}.${key}` : key;
    if (!(key in actObj)) {
      missingFields.push(currentPath);
    } else {
      const expVal = expObj[key];
      const actVal = actObj[key];
      // beide verschachtelte Objekte → rekursiv prüfen
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
      } else if (
        // primitiver Typ-Mismatch oder null vs. primitive
        (expVal === null || typeof expVal !== "object") &&
        (actVal === null || typeof actVal !== "object") &&
        (expVal === null ? actVal !== null : typeof expVal !== typeof actVal)
      ) {
        const expType = expVal === null ? "null" : typeof expVal;
        const actType = actVal === null ? "null" : typeof actVal;
        typeMismatches.push({
          path: currentPath,
          expected: expType,
          actual: actType,
        });
      } else if (
        // Array im einen und primitive/im anderen
        Array.isArray(expVal) !== Array.isArray(actVal)
      ) {
        typeMismatches.push({
          path: currentPath,
          expected: Array.isArray(expVal) ? "array" : typeof expVal,
          actual: Array.isArray(actVal) ? "array" : typeof actVal,
        });
      }
    }
  }

  // 5b) Zusätzliche Felder in actual
  for (const key of Object.keys(actObj)) {
    if (!(key in expObj)) {
      const currentPath = path ? `${path}.${key}` : key;
      extraFields.push(currentPath);
    }
  }

  return { missingFields, extraFields, typeMismatches };
}
