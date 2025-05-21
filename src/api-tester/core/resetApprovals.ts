// src/api-tester/core/resetApprovals.ts

import { kvInstance } from "./kv.ts";

export async function resetApprovalsKV(): Promise<void> {
  try {
    // 1) approvals zurücksetzen
    await kvInstance.set(["approvals"], {});
    console.log("✅ Alle approvals in KV zurückgesetzt.");

    // 2) Alle schema-update-pending Einträge löschen
    for await (
      const entry of kvInstance.list({ prefix: ["schema-update-pending"] })
    ) {
      await kvInstance.delete(entry.key);
    }
    console.log("✅ Alle pending-Schemas in KV gelöscht.");

    // 3) Raw-Blocks leeren (optional)
    await kvInstance.set(["rawBlocks"], {});
    console.log("✅ rawBlocks in KV zurückgesetzt.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Konnte KV nicht komplett zurücksetzen: ${msg}`);
  }
}
