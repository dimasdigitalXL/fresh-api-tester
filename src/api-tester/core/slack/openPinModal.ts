// src/api-tester/core/slack/openPinModal.ts

import { getSlackWorkspaces } from "./slackWorkspaces.ts";

export interface OpenPinModalOptions {
  triggerId: string;
  endpoint: string;
  messageTs: string;
  channelId: string;
}

/**
 * Öffnet ein Slack-Modal zur PIN-Verifizierung.
 * Wir lassen den Modal-Aufruf immer laufen, wenn Workspaces konfiguriert sind.
 */
export async function openPinModal({
  triggerId,
  endpoint,
  messageTs,
  channelId,
}: OpenPinModalOptions): Promise<void> {
  try {
    // 1) Workspace holen
    const workspaces = getSlackWorkspaces();
    if (workspaces.length === 0) {
      console.error(
        "🚨 openPinModal: Kein Slack-Workspace konfiguriert – Modal kann nicht geöffnet werden.",
      );
      return;
    }
    const ws = workspaces[0];

    // 2) private_metadata für das Modal
    const privateMetadata = JSON.stringify({
      endpoint,
      original_ts: messageTs,
      channel: channelId,
    });

    // 3) Modal-Definition
    const view = {
      type: "modal",
      callback_id: "pin_submission",
      private_metadata: privateMetadata,
      title: { type: "plain_text", text: "Verifizierung" },
      submit: { type: "plain_text", text: "Bestätigen" },
      close: { type: "plain_text", text: "Abbrechen" },
      blocks: [
        {
          type: "input",
          block_id: "pin_input",
          label: { type: "plain_text", text: "Bitte PIN eingeben:" },
          element: {
            type: "plain_text_input",
            action_id: "pin",
            placeholder: {
              type: "plain_text",
              text: "nur mit richtiger PIN geht's weiter ;)",
            },
          },
        },
      ],
    };

    // 4) POST an Slack
    const resp = await fetch("https://slack.com/api/views.open", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ws.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trigger_id: triggerId, view }),
    });

    // 5) Debug-Log
    const json = await resp.json();
    console.log("▶️ views.open response:", JSON.stringify(json, null, 2));
    if (!json.ok) {
      console.error("🚨 Slack API views.open fehlgeschlagen:", json.error);
    }
  } catch (err) {
    console.error("❌ openPinModal unerwarteter Fehler:", err);
  }
}
