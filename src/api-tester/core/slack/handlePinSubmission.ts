// src/api-tester/core/slack/handlePinSubmission.ts

import axios from "https://esm.sh/axios@1.4.0";
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

// Struktur eines gespeicherten Approval‐Eintrags
interface ApprovalEntry {
  status: "approved" | "pending";
  by: string;
  at: string; // ISO‐Timestamp
}

// Map von Endpoint‐Keys auf ApprovalEntry oder noch alten String‐Status
type ApprovalsMap = Record<string, ApprovalEntry | string>;

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

  // 6) Approval-Status in KV speichern (inkl. wer und wann)
  try {
    const { value: stored } = await kvInstance.get<ApprovalsMap>(["approvals"]);
    const approvals: ApprovalsMap = stored ?? {};

    const now = new Date().toISOString();
    approvals[key] = {
      status: "approved",
      by: userName,
      at: now,
    };

    await kvInstance.set(["approvals"], approvals);
    console.log(`✅ KV: Approval für ${key} gesetzt von ${userName} um ${now}`);
  } catch (e) {
    console.error("❌ Fehler beim Speichern der Approvals in KV:", e);
  }

  // 7) Blocks aus KV lesen und Slack-Nachricht updaten
  try {
    const { value: storedBlocks } = await kvInstance.get<
      Array<Record<string, unknown>>
    >(["rawBlocks", key]);
    const originalBlocks = storedBlocks ?? [];

    // Decision-Buttons entfernen (block_id beginnt mit "decision_buttons")
    const cleaned = originalBlocks.filter((b) => {
      const bid = typeof b.block_id === "string" ? b.block_id : "";
      return !bid.startsWith("decision_buttons");
    });

    // letzten Divider entfernen, falls vorhanden
    if (cleaned.length > 0 && cleaned.at(-1)?.type === "divider") {
      cleaned.pop();
    }

    // Bestätigungs‐Abschnitt anhängen
    const time = new Date().toLocaleTimeString("de-DE");
    const footer = [
      { type: "divider" as const },
      {
        type: "section" as const,
        text: {
          type: "mrkdwn" as const,
          text: `_AKTUALISIERT_ • ${time}`,
        },
      },
      {
        type: "section" as const,
        text: {
          type: "mrkdwn" as const,
          text: `✅ *Freigegeben durch ${userName}*`,
        },
      },
    ];

    const updatedBlocks = [...cleaned, ...footer];

    // Nachricht mit chat.update aktualisieren
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

    // aktualisierte Blocks zurück in KV
    await kvInstance.set(["rawBlocks", key], updatedBlocks);
    console.log("✅ KV: rawBlocks updated für", key);
  } catch (e) {
    console.error("❌ Fehler beim Slack-Update:", e);
  }

  // 8) Tests neu starten (SKIP_RESET_APPROVALS aktivieren)
  try {
    const cmd = new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", "main.ts"],
      cwd: Deno.cwd(),
      env: { ...Deno.env.toObject(), SKIP_RESET_APPROVALS: "true" },
    });
    const child = cmd.spawn();
    const status = await child.status;
    console.log(`[api-tester] Erneuter Durchlauf mit Exit-Code ${status.code}`);
  } catch (e) {
    console.error("❌ Fehler beim Neustarten der Tests:", e);
  }

  return null;
}
