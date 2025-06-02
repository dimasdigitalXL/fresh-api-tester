// src/api-tester/core/types.ts

/**
 * Repräsentiert ein JSON-Objekt, etwa das Ergebnis eines API-Calls.
 */
export type Schema = Record<string, unknown>;

/**
 * Beschreibt eine Typabweichung in einem Schema-Vergleich.
 * Beispiel:
 *   path = "customer.address.zip"
 *   expected = "string"
 *   actual   = "null"
 */
export interface TypeMismatch {
  path: string;
  expected: string;
  actual: string;
}

/**
 * Ergebnis des Schema-Vergleichs:
 *  - missingFields: im erwarteten Schema vorhanden, in der Antwort nicht.
 *  - extraFields:   in der Antwort vorhanden, aber nicht im erwarteten Schema.
 *  - typeMismatches: Felder, bei denen der Typ abweicht.
 *  - updatedSchema: Das transformierte Schema (z.B. actual-Response, das später versioniert wird).
 */
export interface Diff {
  missingFields: string[];
  extraFields: string[];
  typeMismatches: TypeMismatch[];
  updatedSchema: Schema;
}
