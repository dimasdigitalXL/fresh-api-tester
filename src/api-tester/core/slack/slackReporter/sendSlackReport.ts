// src/api-tester/core/slack/slackReporter/sendSlackReport.ts

import axios from "https://esm.sh/axios@1.4.0";
import { kvInstance } from "../../kv.ts";
import { getSlackWorkspaces } from "../slackWorkspaces.ts";
import { renderHeaderBlock } from "./renderHeaderBlock.ts";
import { renderVersionBlocks } from "./renderVersionBlocks.ts";
import { renderIssueBlocks } from "./renderIssueBlocks.ts";
import { renderStatsBlock } from "./renderStatsBlock.ts";
import type { TestResult } from "../../apiCaller.ts";

export interface VersionUpdate {
  name: string;
  url: string;
  expectedStructure?: string;
}

export async function sendSlackReport(
  testResults: TestResult[],
  versionUpdates: VersionUpdate[] = [], // korrekt: leeres Array als Default
  options: { dryRun?: boolean } = {}, // Optionen-Objekt, Default leer → dryRun=false
): Promise<void> {
  const workspaces = getSlackWorkspaces();

  // 1) Statistik berechnen
  const total = testResults.length;
  const success = testResults.filter((r) => r.success).length;
  const warnings =
    testResults.filter((r) => !r.success && !r.isCritical).length;
  const criticals = testResults.filter((r) => r.isCritical).length;

  // 2) Filter: alles, was Fehler oder Abweichungen hat
  const failing = testResults.filter((r) =>
    !r.success ||
    r.isCritical ||
    (r.missingFields.length > 0) ||
    (r.extraFields.length > 0) ||
    ((r.typeMismatches?.length ?? 0) > 0)
  );

  // 3) Blocks zusammenbauen
  const header = renderHeaderBlock(new Date().toLocaleDateString("de-DE"));
  const versions = versionUpdates.length > 0
    ? renderVersionBlocks(versionUpdates)
    : [];

  // 3a) Issue-Blöcke mit eindeutigen Suffixen
  const issues = failing.flatMap((res) => {
    const suffix = res.endpointName.replace(/\s+/g, "_");
    return renderIssueBlocks([res]).map((blk) => {
      const b = { ...blk } as Record<string, unknown>;
      if (typeof b.block_id === "string") {
        b.block_id = `${b.block_id}_${suffix}`;
      }
      return b;
    });
  });

  const stats = renderStatsBlock(total, success, warnings, criticals);

  // Reihenfolge: Header → Versionen → Issues → Statistik
  const blocks = [
    ...header,
    ...versions,
    ...issues,
    ...stats,
  ];

  // 4) Raw-Blocks & Approvals initial in KV speichern
  {
    const { value: existing } = await kvInstance.get<Record<string, string>>([
      "approvals",
    ]);
    const approvals = existing ?? {};
    for (const res of failing) {
      const key = res.endpointName.replace(/\s+/g, "_");
      const raw = renderIssueBlocks([res]);
      await kvInstance.set(["rawBlocks", key], raw);
      approvals[key] = "pending";
    }
    await kvInstance.set(["approvals"], approvals);
  }

  // 5) Nachricht senden (oder nur Log, wenn dryRun)
  for (const { token, channel } of workspaces) {
    if (options.dryRun) {
      console.log("📋 [DryRun] channel:", channel);
      console.log(
        "📦 [DryRun] Payload:",
        JSON.stringify(
          blocks.length > 50
            ? {
              channel,
              text: `API Testbericht: ${
                warnings + criticals
              } Abweichungen (insgesamt ${total}).`,
            }
            : { channel, text: "API Testbericht", blocks },
          null,
          2,
        ),
      );
      continue;
    }

    const payload = blocks.length > 50
      ? {
        channel,
        text: `API Testbericht: ${
          warnings + criticals
        } Abweichungen (insgesamt ${total}).`,
      }
      : {
        channel,
        text: "API Testbericht",
        blocks,
      };

    try {
      const resp = await axios.post(
        "https://slack.com/api/chat.postMessage",
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
      console.log("▶️ Slack API chat.postMessage response:", resp.data);
    } catch (err) {
      console.error("❌ Fehler beim Senden an Slack:", err);
    }
  }

  console.log("📩 Slack-Testbericht abgeschlossen.");
}
