// src/api-tester/core/slack/openPinModal.ts

import { getSlackWorkspaces } from "./slackWorkspaces.ts";

export interface OpenPinModalOptions {
  triggerId: string;
  endpoint: string;
  messageTs: string;
  channelId: string;
}

/**
 * Öffnet ein Slack-Modal zur PIN-Verifizierung für einen bestimmten Endpunkt.
 */
export async function openPinModal(
  opts: OpenPinModalOptions,
): Promise<void> {
  // Wir nehmen hier einfach das erste Workspace-Token.
  const ws = getSlackWorkspaces()[0];
  if (!ws) {
    throw new Error("Kein Slack-Workspace konfiguriert");
  }

  const { triggerId, endpoint, messageTs, channelId } = opts;

  const privateMetadata = JSON.stringify({
    endpoint,
    original_ts: messageTs,
    channel: channelId,
  });

  const body = {
    trigger_id: triggerId,
    view: {
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
    },
  };

  const resp = await fetch("https://slack.com/api/views.open", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ws.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = await resp.json();
  if (!json.ok) {
    console.error(
      "🚨 Slack API views.open fehlgeschlagen:",
      json.error ?? json,
    );
  }
}
