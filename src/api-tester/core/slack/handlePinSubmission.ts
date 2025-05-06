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
    private_metadata: string; // JSON: { endpoint, original_ts, channel }
  };
  user: { id: string };
}

export async function handlePinSubmission(
  payload: SlackSubmissionPayload,
): Promise<null> {
  // 1️⃣ PIN und Metadaten auslesen
  const pin = payload.view.state.values.pin_input.pin.value;
  const { endpoint, original_ts: originalTs, channel } = JSON.parse(
    payload.view.private_metadata,
  ) as {
    endpoint: string;
    original_ts: string;
    channel: string;
  };

  // 2️⃣ Workspace & Token ermitteln
  const workspaces = getSlackWorkspaces();
  const workspace = workspaces.find((ws) => ws.channel === channel);
  if (!workspace) {
    console.error("🚨 Kein Workspace gefunden für Channel:", channel);
    return null;
  }
  const token = workspace.token;

  // 3️⃣ Nutzername holen
  const userName = await getDisplayName(payload.user.id, token);

  // 4️⃣ PIN validieren
  const GLOBAL_PIN = Deno.env.get("SLACK_APPROVE_PIN") ?? "1234";
  if (pin !== GLOBAL_PIN) {
    console.warn("❌ Falsche PIN für", endpoint);
    return null;
  }
  console.log(`✅ ${userName} hat ${endpoint} freigegeben (PIN korrekt)`);

  // 5️⃣ pending-approvals.json updaten
  const approvalsPath = resolveProjectPath("pending-approvals.json");
  if (existsSync(approvalsPath)) {
    const raw = await Deno.readTextFile(approvalsPath);
    const approvals = JSON.parse(raw) as Record<string, string | unknown>;
    approvals[endpoint] = "waiting";
    await Deno.writeTextFile(
      approvalsPath,
      JSON.stringify(approvals, null, 2),
    );
  }

  // 6️⃣ config.json aktualisieren, falls genehmigt
  const updatedFile = getLatestUpdatedFile(endpoint);
  const configPath = resolveProjectPath("config.json");
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
      await Deno.writeTextFile(
        configPath,
        JSON.stringify(cfg, null, 2),
      );
      console.log(`🛠️ config.json aktualisiert: ${entry.expectedStructure}`);
    }
  }

  // 7️⃣ Slack-Nachricht updaten
  if (originalTs && channel) {
    const rawAppr = await Deno.readTextFile(approvalsPath);
    const { __rawBlocks = {} } = JSON.parse(rawAppr) as {
      __rawBlocks?: Record<string, Array<unknown>>;
    };

    const key = endpoint.replace(/\s+/g, "_");
    const originalBlocks = __rawBlocks[key] ?? [];

    // Buttons entfernen und letzten Divider löschen
    const cleaned = (originalBlocks as Array<Record<string, unknown>>).filter(
      (b) => b.block_id !== "decision_buttons",
    );
    if (
      cleaned.length > 0 &&
      cleaned[cleaned.length - 1].type === "divider"
    ) {
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
    console.log("📤 Slack-Nachricht aktualisiert: Report + AKTUALISIERT-Block");
  }

  // 8️⃣ Tester per Deno.Command erneut starten
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "index.ts"],
    cwd: Deno.cwd(),
    env: { ...Deno.env.toObject(), SKIP_RESET_APPROVALS: "true" },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const child = cmd.spawn();
  const status = await child.status;
  console.log(
    `[api-tester] erneuter Durchlauf beendet mit Exit-Code ${status.code}`,
  );

  return null;
}
