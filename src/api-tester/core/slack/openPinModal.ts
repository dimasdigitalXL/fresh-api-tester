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
 */
export async function openPinModal({
  triggerId,
  endpoint,
  messageTs,
  channelId,
}: OpenPinModalOptions): Promise<void> {
  const [ws] = getSlackWorkspaces();
  if (!ws) throw new Error("Kein Slack-Workspace konfiguriert");

  const privateMetadata = JSON.stringify({
    endpoint,
    original_ts: messageTs,
    channel: channelId,
  });

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

  const resp = await fetch("https://slack.com/api/views.open", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ws.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ trigger_id: triggerId, view }),
  });

  const json = await resp.json();
  if (!json.ok) {
    console.error(
      "🚨 Slack API views.open fehlgeschlagen:",
      json.error ?? json,
    );
  }
}
