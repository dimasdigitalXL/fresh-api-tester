// src/api-tester/core/slack/openPinModal.ts

import { getSlackWorkspaces } from "./slackWorkspaces.ts";

export interface OpenPinModalOptions {
  triggerId: string;
  // jetzt JSON‐String mit endpointName, method, missing, extra, typeMismatches
  endpoint: string;
  messageTs: string;
  channelId: string;
}

interface DiffPayload {
  endpointName: string;
  method: string;
  missing: string[];
  extra: string[];
  typeMismatches: Array<{ path: string; expected: string; actual: string }>;
}

export async function openPinModal({
  triggerId,
  endpoint: payloadJson,
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

    // 2) payload parsen
    let payload: DiffPayload;
    try {
      payload = JSON.parse(payloadJson);
    } catch {
      console.error(
        "🚨 openPinModal: Ungültiges JSON im Button‐Value:",
        payloadJson,
      );
      return;
    }

    // 3) private_metadata für das Modal
    const privateMetadata = JSON.stringify({
      endpoint: payload.endpointName,
      original_ts: messageTs,
      channel: channelId,
    });

    // 4) diff‐Blocks aufbauen
    const diffBlocks = [];

    if (payload.missing.length) {
      diffBlocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*❌ Fehlende Felder (${payload.missing.length}):*\n• ` +
            payload.missing.join("\n• "),
        },
      });
    }
    if (payload.extra.length) {
      diffBlocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*➕ Neue Felder (${payload.extra.length}):*\n• ` +
            payload.extra.join("\n• "),
        },
      });
    }
    if (payload.typeMismatches.length) {
      diffBlocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*⚠️ Typabweichungen (${payload.typeMismatches.length}):*\n` +
            payload.typeMismatches
              .map((m) =>
                `• ${m.path}: erwartet \`${m.expected}\`, erhalten \`${m.actual}\``
              )
              .join("\n"),
        },
      });
    }
    if (diffBlocks.length === 0) {
      diffBlocks.push({
        type: "section",
        text: { type: "mrkdwn", text: "_Keine Abweichungen gefunden._" },
      });
    }

    // 5) Modal definieren
    const view = {
      type: "modal",
      callback_id: "pin_submission",
      private_metadata: privateMetadata,
      title: { type: "plain_text", text: "Änderung bestätigen" },
      submit: { type: "plain_text", text: "Bestätigen" },
      close: { type: "plain_text", text: "Abbrechen" },
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Endpoint:* ${payload.endpointName}\n` +
              `*Methode:* \`${payload.method}\``,
          },
        },
        { type: "divider" },
        ...diffBlocks,
        { type: "divider" },
        {
          type: "input",
          block_id: "pin_input",
          label: { type: "plain_text", text: "PIN eingeben" },
          element: {
            type: "plain_text_input",
            action_id: "pin",
            placeholder: { type: "plain_text", text: "••••" },
            min_length: 4,
            max_length: 6,
          },
        },
      ],
    };

    // 6) Modal öffnen
    const resp = await fetch("https://slack.com/api/views.open", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ws.token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ trigger_id: triggerId, view }),
    });

    // 7) Debug‐Log
    const json = await resp.json();
    console.log("▶️ views.open response:", JSON.stringify(json, null, 2));
    if (!json.ok) {
      console.error("🚨 Slack API views.open fehlgeschlagen:", json.error);
    }
  } catch (err) {
    console.error("❌ openPinModal unerwarteter Fehler:", err);
  }
}
