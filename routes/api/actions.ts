// routes/api/actions.ts

import { HandlerContext } from "$fresh/server.ts";
import { kvInstance } from "../../src/api-tester/core/kv.ts";
import { getSlackWorkspaces } from "../../src/api-tester/core/slack/slackWorkspaces.ts";

interface SlackActionPayload {
  type: string;
  trigger_id?: string;
  user: { id: string };
  actions?: Array<{
    action_id: string;
    value: string;
  }>;
  view?: {
    callback_id: string;
    private_metadata: string;
    state: {
      values: Record<
        string,
        Record<"pin_value", { value: string }>
      >;
    };
  };
}

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

  // payload als urlencoded FormData
  const params = new URLSearchParams(rawBody);
  const payload: SlackActionPayload = JSON.parse(params.get("payload") ?? "{}");
  const action = payload.actions?.[0];

  // Workspace anhand Signing-Secret finden
  const workspaces = getSlackWorkspaces();
  const ws = await (async () => {
    for (const w of workspaces) {
      if (
        await verifySlackRequest(w.signingSecret, timestamp, rawBody, slackSig)
      ) {
        return w;
      }
    }
    return undefined;
  })();
  if (!ws) {
    return new Response("Invalid signature", { status: 401 });
  }

  // Hilfsfunktion für Slack-API-Aufrufe
  const callSlack = (path: string, body: unknown) =>
    fetch(`https://slack.com/api/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ws.token}`,
      },
      body: JSON.stringify(body),
    });

  //
  // 1) „Einverstanden“-Button → PIN-Modal öffnen
  //
  if (action?.action_id === "open_pin_modal") {
    // action.value enthält JSON: { key, channel, ts }
    let meta: { key: string; channel: string; ts: string };
    try {
      meta = JSON.parse(action.value);
    } catch {
      console.error("❌ Ungültige private_metadata:", action.value);
      return new Response("Bad metadata", { status: 400 });
    }

    await callSlack("views.open", {
      trigger_id: payload.trigger_id,
      view: {
        type: "modal",
        callback_id: "submit_pin",
        private_metadata: JSON.stringify(meta),
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

  //
  // 2) „Warten“-Button → auf 'waiting' setzen
  //
  if (action?.action_id === "wait_action") {
    const key = action.value;
    const res = await kvInstance.get<Record<string, string>>(["approvals"]);
    const approvals = res.value ?? {};
    approvals[key] = "waiting";
    await kvInstance.set(["approvals"], approvals);
    return new Response("", { status: 200 });
  }

  //
  // 3) Modal-Submission: PIN prüfen, KV updaten und Original-Nachricht updaten
  //
  if (
    payload.type === "view_submission" &&
    payload.view?.callback_id === "submit_pin"
  ) {
    // private_metadata wieder parsen
    let meta: { key: string; channel: string; ts: string };
    try {
      meta = JSON.parse(payload.view.private_metadata);
    } catch {
      console.error(
        "❌ Ungültige private_metadata im View:",
        payload.view.private_metadata,
      );
      return new Response("Bad metadata", { status: 400 });
    }
    const { key, channel, ts: originalTs } = meta;

    // PIN auswerten
    const pin = payload.view.state.values.pin_input.pin_value.value;
    const expectedPin = Deno.env.get("APPROVAL_PIN") ?? "";
    if (pin !== expectedPin) {
      // Fehler im Modal zurückgeben
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

    // 3a) KV: auf 'approved' setzen
    const res = await kvInstance.get<Record<string, string>>(["approvals"]);
    const approvals = res.value ?? {};
    approvals[key] = "approved";
    await kvInstance.set(["approvals"], approvals);

    // 3b) Original-Slack-Nachricht updaten
    // rawBlocks aus KV laden
    const rawRes = await kvInstance.get<Array<Record<string, unknown>>>([
      "rawBlocks",
      key,
    ]);
    const originalBlocks = rawRes.value ?? [];
    // Buttons entfernen
    const cleanedBlocks = originalBlocks.filter((blk) =>
      !(typeof blk.block_id === "string" &&
        blk.block_id.startsWith("decision_buttons"))
    );
    // letzten Divider entfernen, falls vorhanden
    if (cleanedBlocks.length > 0 && cleanedBlocks.at(-1)?.type === "divider") {
      cleanedBlocks.pop();
    }
    const now = new Date().toLocaleTimeString("de-DE");
    const updateBlocks = [
      ...cleanedBlocks,
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
    // chat.update aufrufen
    await callSlack("chat.update", {
      channel,
      ts: originalTs,
      text: `✅ Freigegeben durch <@${payload.user.id}>`,
      blocks: updateBlocks,
    });
    // neuen Block-Satz zurück in KV
    await kvInstance.set(["rawBlocks", key], updateBlocks);

    // 3c) Ephemeral-Feedback an den Benutzer
    await callSlack("chat.postEphemeral", {
      channel,
      user: payload.user.id,
      text: `✅ Freigabe für \`${key}\` erfolgreich.`,
    });

    return new Response("", { status: 200 });
  }

  // Default
  return new Response(null, { status: 200 });
};
