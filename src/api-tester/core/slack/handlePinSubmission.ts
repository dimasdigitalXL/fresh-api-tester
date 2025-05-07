// src/api-tester/core/slack/handlePinSubmission.ts

import axios from "https://esm.sh/axios@1.4.0";
import { existsSync } from "https://deno.land/std@0.216.0/fs/mod.ts";
import { join } from "https://deno.land/std@0.216.0/path/mod.ts";
import { resolveProjectPath } from "../utils.ts";
import { getSlackWorkspaces } from "./slackWorkspaces.ts";
import { getLatestUpdatedFile } from "../structureAnalyzer.ts";
import { getDisplayName } from "./getDisplayName.ts";

interface SlackSubmissionPayload {
  view: {
    state: {
      values: {
        pin_input: { pin: { value: string } };
      };
    };
    private_metadata: string;
  };
  user: { id: string };
}

/**
 * Verarbeitet das Modal-Callback, validiert die PIN und updated
 * approvals + config.json + Slack-Message.
 */
export async function handlePinSubmission(
  payload: SlackSubmissionPayload,
): Promise<null> {
  const pin = payload.view.state.values.pin_input.pin.value;
  const { endpoint, original_ts: originalTs, channel } = JSON.parse(
    payload.view.private_metadata,
  ) as { endpoint: string; original_ts: string; channel: string };

  // Workspace & Token
  const ws = getSlackWorkspaces().find((w) => w.channel === channel);
  if (!ws) {
    console.error("🚨 Kein Workspace gefunden für Channel:", channel);
    return null;
  }
  const token = ws.token;

  // User-Name
  const userName = await getDisplayName(payload.user.id, token);

  // PIN prüfen
  const GLOBAL_PIN = Deno.env.get("SLACK_APPROVE_PIN") ?? "1234";
  if (pin !== GLOBAL_PIN) {
    console.warn("❌ Falsche PIN für", endpoint);
    return null;
  }

  // 1) pending-approvals.json updaten
  const approvalsPath = resolveProjectPath(
    "api-tester",
    "pending-approvals.json",
  );
  if (existsSync(approvalsPath)) {
    const raw = await Deno.readTextFile(approvalsPath);
    const approvals = JSON.parse(raw) as Record<string, string>;
    approvals[endpoint] = "waiting";
    await Deno.writeTextFile(approvalsPath, JSON.stringify(approvals, null, 2));
  }

  // 2) config.json übernehmen, falls neue Struktur vorliegt
  const updatedFile = getLatestUpdatedFile(endpoint);
  const configPath = resolveProjectPath("api-tester", "config.json");
  if (updatedFile && existsSync(configPath)) {
    const rawCfg = await Deno.readTextFile(configPath);
    const cfg = JSON.parse(rawCfg) as {
      endpoints: Array<Record<string, unknown>>;
    };
    const entry = cfg.endpoints.find(
      (e) => (e.name as string).replace(/\s+/g, "_") === endpoint,
    );
    if (entry) {
      entry.expectedStructure = join("expected", updatedFile);
      await Deno.writeTextFile(configPath, JSON.stringify(cfg, null, 2));
      console.log(`🛠️ config.json aktualisiert: ${entry.expectedStructure}`);
    }
  }

  // 3) Slack-Nachricht updaten (Report + „AKTUALISIERT“-Block)
  if (originalTs && channel) {
    const rawAppr = await Deno.readTextFile(approvalsPath);
    const { __rawBlocks = {} } = JSON.parse(rawAppr) as {
      __rawBlocks?: Record<string, Array<unknown>>;
    };
    const key = endpoint.replace(/\s+/g, "_");
    const originalBlocks = __rawBlocks[key] ?? [];
    const cleaned = (originalBlocks as Array<Record<string, unknown>>).filter(
      (b) => b.block_id !== "decision_buttons",
    );
    if (cleaned.length > 0 && cleaned.at(-1)?.type === "divider") {
      cleaned.pop();
    }
    const nowTime = new Date().toLocaleTimeString("de-DE");
    const newSection = [
      { type: "divider" },
      { type: "section", text: { type: "mrkdwn", text: "_AKTUALISIERT_" } },
      { type: "context", elements: [{ type: "mrkdwn", text: nowTime }] },
      {
        type: "section",
        text: { type: "mrkdwn", text: `✅ *Freigegeben durch ${userName}*` },
      },
    ];
    await axios.post(
      "https://slack.com/api/chat.update",
      {
        channel,
        ts: originalTs,
        text: `✅ ${userName} hat *${endpoint}* freigegeben.`,
        blocks: [...cleaned, ...newSection],
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );
  }

  // 4) Tests sofort neu anstoßen
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "main.ts"], // oder dein entrypoint
    cwd: Deno.cwd(),
    env: { ...Deno.env.toObject(), SKIP_RESET_APPROVALS: "true" },
  });
  const child = cmd.spawn();
  const status = await child.status;
  console.log(`[api-tester] erneuter Durchlauf mit Exit-Code ${status.code}`);

  return null;
}
