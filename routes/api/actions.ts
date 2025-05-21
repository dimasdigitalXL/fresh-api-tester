// routes/api/actions.ts

import { HandlerContext } from "$fresh/server.ts";
import { kvInstance } from "../../src/api-tester/core/kv.ts";
import { getSlackWorkspaces } from "../../src/api-tester/core/slack/slackWorkspaces.ts";

interface SlackButtonAction {
  action_id: string;
  value: string;
}

interface SlackViewState {
  values: Record<
    string,
    {
      [actionId: string]: { value: string };
    }
  >;
}

interface SlackView {
  state: SlackViewState;
  private_metadata?: string;
  callback_id?: string;
}

interface SlackPayload {
  type: string;
  trigger_id?: string;
  user?: { id: string };
  actions?: SlackButtonAction[];
  view?: SlackView;
}

/**
 * Verifiziert, dass der Request wirklich von Slack kommt.
 */
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
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const timestamp = req.headers.get("X-Slack-Request-Timestamp") ?? "";
  const slackSig = req.headers.get("X-Slack-Signature") ?? "";
  const rawBody = await req.text();

  // Slack schickt payload als urlencoded FormData
  const params = new URLSearchParams(rawBody);
  const payloadJson = params.get("payload");
  if (!payloadJson) {
    return new Response("Bad Request", { status: 400 });
  }

  let payload: SlackPayload;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  // Suche Workspace basierend auf Signing Secret
  const workspaces = getSlackWorkspaces();
  const ws = await workspaces.find(async (w) =>
    await verifySlackRequest(w.signingSecret, timestamp, rawBody, slackSig)
  );
  if (!ws) {
    return new Response("Invalid signature", { status: 401 });
  }

  const callSlack = (path: string, body: unknown) =>
    fetch(`https://slack.com/api/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ws.token}`,
      },
      body: JSON.stringify(body),
    });

  const action = payload.actions?.[0];

  // 1) Button "Einverstanden" → Modal öffnen
  if (action?.action_id === "open_pin_modal" && payload.trigger_id) {
    await callSlack("views.open", {
      trigger_id: payload.trigger_id,
      view: {
        type: "modal",
        callback_id: "submit_pin",
        private_metadata: action.value, // unser key für später
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

  // 2) Button "Warten" → Approval auf "waiting" setzen
  if (action?.action_id === "wait_action") {
    const key = action.value;
    const { value: stored } = await kvInstance.get<Record<string, string>>([
      "approvals",
    ]);
    const approvals = stored ?? {};
    approvals[key] = "waiting";
    await kvInstance.set(["approvals"], approvals);
    return new Response("", { status: 200 });
  }

  // 3) Modal-Submission: PIN prüfen und ggf. auf "approved" setzen
  if (
    payload.type === "view_submission" &&
    payload.view?.callback_id === "submit_pin" &&
    payload.view.state.values["pin_input"]?.["pin_value"]?.value
  ) {
    const key = payload.view.private_metadata ?? "";
    const pin = payload.view.state.values["pin_input"]["pin_value"].value;
    const expectedPin = Deno.env.get("APPROVAL_PIN") ?? "";
    console.log("🔑 Loaded APPROVAL_PIN:", expectedPin);

    if (pin === expectedPin) {
      // Approval aktualisieren
      const { value: stored } = await kvInstance.get<Record<string, string>>(
        ["approvals"],
      );
      const approvals = stored ?? {};
      approvals[key] = "approved";
      await kvInstance.set(["approvals"], approvals);

      // Feedback an den user (ephemeral message)
      if (payload.user?.id) {
        await callSlack("chat.postEphemeral", {
          channel: key,
          user: payload.user.id,
          text: `✅ Freigabe für \`${key}\` erfolgreich.`,
        });
      }

      return new Response("", { status: 200 });
    } else {
      // Falscher PIN: Fehler im Modal anzeigen
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
  }

  // Falls nichts zutrifft, liefere einfachen 200
  return new Response(null, { status: 200 });
};
