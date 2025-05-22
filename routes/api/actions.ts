// routes/api/actions.ts

import { HandlerContext } from "$fresh/server.ts";
import { kvInstance } from "../../src/api-tester/core/kv.ts";
import { getSlackWorkspaces } from "../../src/api-tester/core/slack/slackWorkspaces.ts";

// Prüft, ob der Request wirklich von Slack stammt
async function verifySlackRequest(
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  slackSig: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(signingSecret);
  const msgData = encoder.encode(`v0:${timestamp}:${rawBody}`);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `v0=${hex}` === slackSig;
}

export const handler = async (
  req: Request,
  _ctx: HandlerContext,
): Promise<Response> => {
  const timestamp = req.headers.get("X-Slack-Request-Timestamp") ?? "";
  const slackSig = req.headers.get("X-Slack-Signature") ?? "";
  const rawBody = await req.text();

  // Slack sendet die Nutzlast als urlencoded FormData
  const params = new URLSearchParams(rawBody);
  const payload = JSON.parse(params.get("payload")!);
  const action = payload.actions?.[0];

  // Workspace anhand des Signing-Secrets finden
  const workspaces = getSlackWorkspaces();
  const ws = await (async () => {
    for (const w of workspaces) {
      if (
        await verifySlackRequest(
          w.signingSecret,
          timestamp,
          rawBody,
          slackSig,
        )
      ) {
        return w;
      }
    }
    return undefined;
  })();
  if (!ws) {
    console.warn("🚨 Ungültige Slack-Signatur");
    return new Response("Invalid signature", { status: 401 });
  }

  // Helper, um Slack-APIs aufzurufen
  const callSlack = (path: string, body: unknown) =>
    fetch(`https://slack.com/api/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ws.token}`,
      },
      body: JSON.stringify(body),
    });

  // 1) Klick auf „Einverstanden“ → PIN-Modal öffnen
  if (action?.action_id === "open_pin_modal") {
    const channel = payload.channel?.id ?? "";
    const originalTs = payload.message?.ts ?? "";
    const meta = JSON.stringify({
      endpoint: action.value as string,
      channel,
      original_ts: originalTs,
    });
    await callSlack("views.open", {
      trigger_id: payload.trigger_id,
      view: {
        type: "modal",
        callback_id: "submit_pin",
        private_metadata: meta,
        title: { type: "plain_text", text: "PIN bestätigen" },
        blocks: [
          {
            type: "input",
            block_id: "pin_input",
            label: {
              type: "plain_text",
              text: "Gib deinen 4-stelligen PIN ein",
            },
            element: {
              type: "plain_text_input",
              action_id: "pin_value",
              placeholder: { type: "plain_text", text: "••••" },
            },
          },
        ],
        submit: { type: "plain_text", text: "Bestätigen" },
      },
    });
    return new Response(null, { status: 200 });
  }

  // 2) Klick auf „Warten“ → Approval auf "waiting" setzen
  if (action?.action_id === "wait_action") {
    const key = action.value as string;
    const { value: approvalsRaw } = await kvInstance.get<
      Record<string, string>
    >(["approvals"]);
    const approvals = approvalsRaw ?? {};
    approvals[key] = "waiting";
    await kvInstance.set(["approvals"], approvals);
    return new Response("", { status: 200 });
  }

  // 3) Modal-Submission: PIN prüfen und ggf. auf "approved" setzen
  if (
    payload.type === "view_submission" &&
    payload.view.callback_id === "submit_pin"
  ) {
    let meta: { endpoint: string; channel: string; original_ts: string };
    try {
      meta = JSON.parse(payload.view.private_metadata);
    } catch {
      console.error(
        "❌ Ungültige private_metadata:",
        payload.view.private_metadata,
      );
      return new Response("Bad metadata", { status: 400 });
    }
    const { endpoint, channel, original_ts } = meta;
    const pin = payload.view.state.values.pin_input.pin_value.value as string;
    const expectedPin = Deno.env.get("APPROVAL_PIN") ?? "";
    console.log("🔑 Loaded APPROVAL_PIN:", expectedPin);

    if (pin !== expectedPin) {
      // PIN falsch → Fehler im Modal anzeigen
      return new Response(
        JSON.stringify({
          response_action: "errors",
          errors: { pin_input: "Falscher PIN" },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // 3a) Approval in KV updaten
    const { value: approvalsRaw2 } = await kvInstance.get<
      Record<string, string>
    >(["approvals"]);
    const approvals2 = approvalsRaw2 ?? {};
    approvals2[endpoint] = "approved";
    await kvInstance.set(["approvals"], approvals2);
    console.log("✅ KV: approval status ‘approved’ für", endpoint);

    // 3b) Original-Nachricht updaten (Buttons entfernen und Freigabe-Hinweis anhängen)
    const { value: rawBlocksRaw } = await kvInstance.get<
      Array<Record<string, unknown>>
    >(["rawBlocks", endpoint]);
    const originalBlocks = rawBlocksRaw ?? [];

    // Decision-Buttons entfernen
    const cleaned = originalBlocks.filter((b) =>
      typeof b.block_id === "string" &&
      !b.block_id.startsWith("decision_buttons")
    );
    // Letzten Divider löschen, falls vorhanden
    if (cleaned.length > 0 && cleaned.at(-1)?.type === "divider") {
      cleaned.pop();
    }

    // Neue Abschnitte anhängen
    const now = new Date().toLocaleTimeString("de-DE");
    const newSections: Record<string, unknown>[] = [
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: `_AKTUALISIERT_ • ${now}` },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `✅ *Freigegeben durch <@${payload.user.id}>*`,
        },
      },
    ];
    const updatedBlocks = [...cleaned, ...newSections];

    // Slack-Message updaten
    await callSlack("chat.update", {
      channel,
      ts: original_ts,
      text: `✅ Freigegeben durch <@${payload.user.id}>`,
      blocks: updatedBlocks,
    });
    console.log("▶️ Slack API chat.update: Freigabe ausgeführt");

    // rawBlocks in KV aktualisieren
    await kvInstance.set(["rawBlocks", endpoint], updatedBlocks);

    return new Response("", { status: 200 });
  }

  // Standard-Response
  return new Response(null, { status: 200 });
};
