// src/api-tester/core/resetApprovals.ts

import { kvInstance } from "./kv.ts";

/**
 * Löscht den kompletten approvals-Eintrag in Deno KV,
 * sodass alle Endpoints wieder neutral stehen.
 */
export async function resetApprovalsKV(): Promise<void> {
  try {
    await kvInstance.set(["approvals"], {});
    console.log("✅ Alle approvals in KV zurückgesetzt.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Konnte approvals in KV nicht zurücksetzen: ${msg}`);
  }
}
