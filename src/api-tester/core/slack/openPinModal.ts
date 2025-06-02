// src/api-tester/core/slack/openPinModal.ts

import { getSlackWorkspaces } from "./slackWorkspaces.ts";

export interface OpenPinModalOptions {
  triggerId: string;
  endpointJson: string; // JSON-String mit { endpointName, method, missing[], extra[], typeMismatches[], original_ts, channel }
}

export async function openPinModal({
  triggerId,
  endpointJson,
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

    // 2) payload parsen (enthält endpointName, method, missing, extra, typeMismatches, original_ts, channel)
    let payload: {
      endpointName: string;
      method: string;
      missing: string[];
      extra: string[];
      typeMismatches: Array<{ path: string; expected: string; actual: string }>;
      original_ts: string;
      channel: string;
    };
    try {
      payload = JSON.parse(endpointJson);
    } catch {
      console.error(
        "🚨 openPinModal: Ungültiges JSON im Button‐Value:",
        endpointJson,
      );
      return;
    }

    // 3) private_metadata für das Modal zusammenstellen (inkl. original_ts + channel)
    const privateMetadata = JSON.stringify({
      endpoint: payload.endpointName,
      method: payload.method,
      missing: payload.missing,
      extra: payload.extra,
      typeMismatches: payload.typeMismatches,
      original_ts: payload.original_ts,
      channel: payload.channel,
    });

    // 4) Modal definieren
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
            text:
              `*Endpoint:* ${payload.endpointName}\n*Methode:* \`${payload.method}\``,
          },
        },
        { type: "divider" },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*❌ Fehlende Felder (${payload.missing.length}):*\n• ${
              payload.missing.join("\n• ")
            }`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*➕ Neue Felder (${payload.extra.length}):*\n• ${
              payload.extra.join("\n• ")
            }`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*⚠️ Typabweichungen (${payload.typeMismatches.length}):*\n` +
              payload.typeMismatches
                .map((m) =>
                  `• \`${m.path}\`: erwartet \`${m.expected}\`, erhalten \`${m.actual}\``
                )
                .join("\n"),
          },
        },
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

    // 5) Modal öffnen
    const resp = await fetch("https://slack.com/api/views.open", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ws.token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ trigger_id: triggerId, view }),
    });

    const json = await resp.json();
    console.log("▶️ views.open response:", JSON.stringify(json, null, 2));
    if (!json.ok) {
      console.error("🚨 Slack API views.open fehlgeschlagen:", json.error);
    }
  } catch (err) {
    console.error("❌ openPinModal unerwarteter Fehler:", err);
  }
}
