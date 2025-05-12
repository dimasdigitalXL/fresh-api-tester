// src/api-tester/core/slack/handlePinSubmission.ts

import axios from "https://esm.sh/axios@1.4.0";
import { existsSync } from "https://deno.land/std@0.216.0/fs/mod.ts";
import { join } from "https://deno.land/std@0.216.0/path/mod.ts";
import { resolveProjectPath } from "../utils.ts";
import { getSlackWorkspaces } from "./slackWorkspaces.ts";
import { getLatestUpdatedFile } from "../structureAnalyzer.ts";
import { getDisplayName } from "./getDisplayName.ts";

export interface SlackSubmissionPayload {
  view: {
    state: {
      values: {
        pin_input: { pin: { value: string } };
      };
    };
    private_metadata: string;
    callback_id: string;
  };
  user: { id: string };
}

export async function handlePinSubmission(
  payload: SlackSubmissionPayload,
): Promise<null> {
  console.log("🔔 handlePinSubmission aufgerufen");
  console.log("🔍 Payload.view:", JSON.stringify(payload.view, null, 2));
  console.log("🔍 Payload.user:", JSON.stringify(payload.user));

  const pin = payload.view.state.values.pin_input.pin.value;
  console.log("🔑 Eingegebene PIN:", pin);

  let meta: { endpoint: string; original_ts: string; channel: string };
  try {
    meta = JSON.parse(payload.view.private_metadata);
    console.log("📝 private_metadata geparsed:", meta);
  } catch (e) {
    console.error("❌ Konnte private_metadata nicht parsen:", e);
    return null;
  }
  const { endpoint, original_ts: originalTs, channel } = meta;

  // Workspace & Token
  const ws = getSlackWorkspaces().find((w) => w.channel === channel);
  if (!ws) {
    console.error("🚨 Kein Workspace gefunden für Channel:", channel);
    return null;
  }
  console.log("✅ Slack-Workspace gefunden:", ws.channel);
  const token = ws.token;

  // User-Name
  let userName: string;
  try {
    userName = await getDisplayName(payload.user.id, token);
    console.log("👤 Angefragter User:", userName);
  } catch (e) {
    console.error("❌ Fehler bei getDisplayName:", e);
    return null;
  }

  // PIN prüfen
  const GLOBAL_PIN = Deno.env.get("SLACK_APPROVE_PIN") ?? "1234";
  if (pin !== GLOBAL_PIN) {
    console.warn("❌ Falsche PIN für", endpoint);
    return null;
  }
  console.log("✅ PIN korrekt, fahre fort…");

  // 1) pending-approvals.json updaten
  const approvalsPath = resolveProjectPath(
    "api-tester",
    "pending-approvals.json",
  );
  console.log("📂 approvalsPath:", approvalsPath);
  if (existsSync(approvalsPath)) {
    const raw = await Deno.readTextFile(approvalsPath);
    const approvals = JSON.parse(raw) as Record<string, string>;
    approvals[endpoint] = "waiting";
    await Deno.writeTextFile(approvalsPath, JSON.stringify(approvals, null, 2));
    console.log("✅ pending-approvals.json geschrieben");
  } else {
    console.warn("⚠️ pending-approvals.json nicht gefunden, übersprungen");
  }

  // 2) config.json übernehmen, falls neue Struktur vorliegt
  const updatedFile = getLatestUpdatedFile(endpoint);
  console.log("📄 Gefundene update-Datei:", updatedFile);
  const configPath = resolveProjectPath("api-tester", "config.json");
  console.log("📂 configPath:", configPath);
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
      console.log("🛠️ config.json aktualisiert auf:", entry.expectedStructure);
    } else {
      console.warn("⚠️ Kein Eintrag in config.json für Endpoint:", endpoint);
    }
  }

  // 3) Slack-Nachricht updaten
  try {
    const rawAppr = await Deno.readTextFile(approvalsPath);
    const { __rawBlocks = {} } = JSON.parse(rawAppr) as {
      __rawBlocks?: Record<string, Array<unknown>>;
    };
    const key = endpoint.replace(/\s+/g, "_");
    const originalBlocks = __rawBlocks[key] ?? [];
    console.log("📦 Original Blocks:", originalBlocks.length, "Stück");
    // Blocks filtern & neu anhängen…
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
    console.log("🔁 Sende chat.update mit zusätzlichen Blocks");
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
    console.log("✅ Slack-Nachricht aktualisiert");
  } catch (e) {
    console.error("❌ Fehler beim Slack-Update:", e);
  }

  // 4) Tests sofort neu anstoßen
  console.log("🚀 Starte erneuten Testdurchlauf");
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "main.ts"],
    cwd: Deno.cwd(),
    env: { ...Deno.env.toObject(), SKIP_RESET_APPROVALS: "true" },
  });
  const child = cmd.spawn();
  const status = await child.status;
  console.log(`[api-tester] erneuter Durchlauf mit Exit-Code ${status.code}`);

  return null;
}
