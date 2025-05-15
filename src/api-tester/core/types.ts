// src/api-tester/core/types.ts

export type Schema = Record<string, unknown>;

export interface TypeMismatch {
  path: string; // z.B. "customer.address.zip"
  expected: string; // z.B. "string"
  actual: string; // z.B. "null"
}

export interface Diff {
  missingFields: string[]; // im expected, aber nicht im actual
  extraFields: string[]; // im actual, aber nicht im expected
  typeMismatches: TypeMismatch[]; // Felder mit falschem Typ
  updatedSchema: Schema; // transformValues(actualResponse)
}
