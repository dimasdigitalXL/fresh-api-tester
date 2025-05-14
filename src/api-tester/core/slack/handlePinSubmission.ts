// src/api-tester/core/slack/handlePinSubmission.ts

import axios from "https://esm.sh/axios@1.4.0";
// ① korrekter Import der Kv-Instanz
import { kvInstance } from "../kv.ts";
import { getSlackWorkspaces } from "./slackWorkspaces.ts";
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

  // 1) PIN auslesen
  const pin = payload.view.state.values.pin_input.pin.value;

  // 2) private_metadata parsen
  let meta: { endpoint: string; original_ts: string; channel: string };
  try {
    meta = JSON.parse(payload.view.private_metadata);
  } catch {
    console.error("❌ Konnte private_metadata nicht parsen");
    return null;
  }
  const { endpoint, original_ts: originalTs, channel } = meta;
  const key = endpoint.replace(/\s+/g, "_");

  // 3) Workspace & Token ermitteln
  const ws = getSlackWorkspaces().find((w) => w.channel === channel);
  if (!ws) {
    console.error("🚨 Kein Workspace gefunden für Channel:", channel);
    return null;
  }
  const token = ws.token;

  // 4) DisplayName holen
  let userName: string;
  try {
    userName = await getDisplayName(payload.user.id, token);
  } catch (e) {
    console.error("❌ Fehler bei getDisplayName:", e);
    return null;
  }

  // 5) PIN prüfen
  const GLOBAL_PIN = Deno.env.get("SLACK_APPROVE_PIN") ?? "1234";
  if (pin !== GLOBAL_PIN) {
    console.warn("❌ Falsche PIN für", endpoint);
    return null;
  }

  // 6) Approval-Status in KV speichern
  try {
    const { value: storedApprovals } = await kvInstance.get<
      Record<string, string>
    >(
      ["approvals"],
    );
    const approvals = storedApprovals ?? {};
    approvals[key] = "approved";
    await kvInstance.set(["approvals"], approvals);
    console.log("✅ KV: approval status ‘approved’ für", key);
  } catch (e) {
    console.error("❌ Fehler beim Speichern der Approvals in KV:", e);
  }

  // 7) Blocks aus KV lesen und Nachricht aktualisieren
  console.log("🔧 Update Slack Nachricht für Endpoint:", endpoint);
  try {
    const { value: storedBlocks } = await kvInstance.get<
      Array<Record<string, unknown>>
    >(["rawBlocks", key]);
    const originalBlocks = storedBlocks ?? [];

    // Decision-Buttons entfernen
    const cleaned = originalBlocks.filter((b) =>
      b.block_id !== "decision_buttons"
    );
    // letzten Divider entfernen
    if (cleaned.length > 0 && cleaned.at(-1)?.type === "divider") cleaned.pop();

    // Bestätigungs-Abschnitt anhängen
    const now = new Date().toLocaleTimeString("de-DE");
    const newSection = [
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: `_AKTUALISIERT_ • ${now}` },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `✅ *Freigegeben durch ${userName}*` },
      },
    ];
    const updatedBlocks = [...cleaned, ...newSection];

    // Chat-Update
    const resp = await axios.post(
      "https://slack.com/api/chat.update",
      {
        channel,
        ts: originalTs,
        text: `✅ ${userName} hat *${endpoint}* freigegeben.`,
        blocks: updatedBlocks,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );
    console.log("▶️ Slack API chat.update response:", resp.data);

    // updatedBlocks zurück in KV
    await kvInstance.set(["rawBlocks", key], updatedBlocks);
    console.log("✅ KV: rawBlocks updated für", key);
  } catch (e) {
    console.error("❌ Fehler beim Slack-Update:", e);
  }

  // 8) Tests neu starten
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
