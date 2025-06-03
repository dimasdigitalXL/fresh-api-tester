/**
 * Repräsentiert ein JSON-Objekt, etwa das Ergebnis eines API-Calls.
 */
export type Schema = Record<string, unknown>;

/**
 * Beschreibt eine Typabweichung in einem Schema-Vergleich.
 */
export interface TypeMismatch {
  path: string;
  expected: string;
  actual: string;
}

/**
 * Ergebnis des Schema-Vergleichs:
 */
export interface Diff {
  missingFields: string[];
  extraFields: string[];
  typeMismatches: TypeMismatch[];
  updatedSchema: Schema;
}

/**
 * Ergebnis eines API-Tests inklusive Schema-Abgleich.
 */
export interface TestResult {
  endpointName: string;
  method: string;
  success: boolean;
  isCritical: boolean;
  status: number | null; // Status kann jetzt auch null sein
  errorMessage: string | null;
  errorDetails?: string;
  missingFields: string[];
  extraFields: string[];
  typeMismatches: TypeMismatch[];
  updatedStructure: string | null;
  expectedFile?: string;
  expectedMissing?: boolean;
}

/**
 * Typ für HTTP-Methoden
 */
export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Version-Update für API-Endpunkte
 */
export interface VersionUpdate {
  name: string;
  url: string;
  expectedStructure?: string;
}

/**
 * SchemaUpdate für Git-Push
 */
export interface SchemaUpdate {
  key: string;
  fsPath: string;
  newSchema: Schema;
}

/**
 * Git-Repository Info
 */
export interface RepoInfo {
  owner: string;
  repo: string;
  branch: string;
}
