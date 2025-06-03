// src/api-tester/core/types.ts

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type Schema = Record<string, unknown>;

export interface TypeMismatch {
  path: string;
  expected: string;
  actual: string;
}

export interface Diff {
  missingFields: string[];
  extraFields: string[];
  typeMismatches: TypeMismatch[];
  updatedSchema: Schema;
}

export interface TestResult {
  endpointName: string;
  method: Method;
  success: boolean;
  isCritical: boolean;
  status: number | null;
  errorMessage: string | null;
  missingFields: string[];
  extraFields: string[];
  typeMismatches: TypeMismatch[];
  updatedStructure: Schema | null;
  expectedFile?: string;
  expectedMissing?: boolean;
  actualData?: unknown;
}

export interface EndpointConfig {
  name: string;
  url: string;
  method: Method;
  requiresId?: boolean;
  expectedStructure?: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number>;
  bodyFile?: string;
}

export interface VersionUpdate {
  name: string;
  url: string;
  expectedStructure?: string;
}

export interface SchemaUpdate {
  key: string;
  fsPath: string;
  newSchema: Schema;
}
