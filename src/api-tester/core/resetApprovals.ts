// src/api-tester/core/resetApprovals.ts

import { kvInstance } from "./kv.ts";

/**
 * Setzt alle relevanten KV-Einträge zurück:
 * 1) approvals (setzt auf leeres Objekt)
 * 2) rawBlocks (löscht alle Einträge unter Prefix ["rawBlocks"])
 * 3) schema-update-pending (löscht alle Pending-Schemas)
 * 4) expected (löscht alle in KV gespeicherten Expected-Schemas)
 */
export async function resetApprovalsKV(): Promise<void> {
  try {
    // 1) approvals komplett zurücksetzen
    await kvInstance.set(["approvals"], {});
    console.log("✅ Alle approvals in KV zurückgesetzt.");

    // 2) rawBlocks löschen (alle Einträge unter Prefix ["rawBlocks", key])
    for await (const entry of kvInstance.list({ prefix: ["rawBlocks"] })) {
      await kvInstance.delete(entry.key);
    }
    console.log("✅ Alle rawBlocks in KV gelöscht.");

    // 3) Alle schema-update-pending Einträge löschen
    for await (
      const entry of kvInstance.list({ prefix: ["schema-update-pending"] })
    ) {
      await kvInstance.delete(entry.key);
    }
    console.log("✅ Alle pending-Schemas in KV gelöscht.");

    // 4) Alle erwarteten Schemas löschen (Prefix ["expected", key])
    for await (const entry of kvInstance.list({ prefix: ["expected"] })) {
      await kvInstance.delete(entry.key);
    }
    console.log("✅ Alle expected-Schemas in KV gelöscht.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Konnte KV nicht vollständig zurücksetzen: ${msg}`);
  }
}
