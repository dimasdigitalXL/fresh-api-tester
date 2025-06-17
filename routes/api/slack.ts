// routes/api/slack.ts
import "https://deno.land/std@0.216.0/dotenv/load.ts";
import { Handlers } from "$fresh/server.ts";
import { validateSignature } from "../../src/api-tester/core/slack/validateSignature.ts";
import { openPinModal } from "../../src/api-tester/core/slack/openPinModal.ts";
import {
  handlePinSubmission,
  type SlackSubmissionPayload,
} from "../../src/api-tester/core/slack/handlePinSubmission.ts";
import { slackDebugEvents } from "../../src/api-tester/core/slack/debugStore.ts";

/** Payload für Block-Actions (form-urlencoded) */
interface BlockActionPayload {
  type: string;
  trigger_id: string;
  actions: Array<{ value: string }>;
}

const SKIP_VERIFY = Deno.env.get("SKIP_VALIDATE_SIGNATURE") === "true";

export const handler: Handlers = {
  // GET liefert alle gespeicherten Debug-Events als JSON
  GET(_req, _ctx) {
    return new Response(
      JSON.stringify({ events: slackDebugEvents }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  },

  // POST verarbeitet eingehende Slack-Interaktionen
  async POST(req, _ctx) {
    const rawBody = await req.text();
    const contentType = req.headers.get("content-type") ?? "";

    // ─── 1) Debug: Einzelne Events parsen und speichern ────────────
    try {
      let parsed: unknown;
      if (contentType.includes("application/json")) {
        parsed = JSON.parse(rawBody);
      } else {
        const params = new URLSearchParams(rawBody);
        parsed = JSON.parse(params.get("payload") ?? "{}");
      }

      if (typeof parsed === "object" && parsed !== null) {
        const recordParsed = parsed as Record<string, unknown>;
        const rawEvents = recordParsed.events;
        let eventsArray: unknown[];
        if (Array.isArray(rawEvents)) {
          eventsArray = rawEvents as unknown[];
        } else {
          eventsArray = [parsed];
        }

        const now = Date.now();
        for (const ev of eventsArray) {
          let evtType = "unknown";
          if (typeof ev === "object" && ev !== null) {
            const recordEv = ev as Record<string, unknown>;
            const typeVal = recordEv.type;
            if (typeof typeVal === "string") {
              evtType = typeVal;
            }
          }
          slackDebugEvents.unshift({
            time: now,
            type: evtType,
            rawPayload: ev,
          });
        }
        // Maximal 20 Einträge behalten
        if (slackDebugEvents.length > 20) {
          slackDebugEvents.splice(20);
        }
      }
    } catch {
      // Parse-Fehler ignorieren
    }

    // ─── 2) Signature Verification (überspringen bei SKIP_VERIFY) ─────
    if (!SKIP_VERIFY) {
      const sig = req.headers.get("x-slack-signature");
      const ts = req.headers.get("x-slack-request-timestamp");
      if (
        typeof sig !== "string" ||
        typeof ts !== "string" ||
        !(await validateSignature(req, rawBody))
      ) {
        console.warn("🚨 Ungültige Slack-Signatur");
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    // ─── 3) application/json: URL-Verification & Modal-Submit ───────
    if (contentType.includes("application/json")) {
      let obj: unknown;
      try {
        obj = JSON.parse(rawBody);
      } catch {
        return new Response("", { status: 400 });
      }
      if (typeof obj === "object" && obj !== null) {
        const record = obj as Record<string, unknown>;
        // URL-Verification
        if (
          typeof record.type === "string" &&
          record.type === "url_verification" &&
          typeof record.challenge === "string"
        ) {
          return new Response(record.challenge, {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          });
        }
        // Modal-Submit (PIN-Dialog)
        if (
          typeof record.type === "string" &&
          record.type === "view_submission"
        ) {
          const submission = record as unknown as SlackSubmissionPayload;
          void handlePinSubmission(submission);
          return new Response("", { status: 200 });
        }
      }
      return new Response("", { status: 200 });
    }

    // ─── 4) application/x-www-form-urlencoded: Block-Actions ─────────
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(rawBody);
      let payload: unknown;
      try {
        payload = JSON.parse(params.get("payload") ?? "{}");
      } catch {
        return new Response("", { status: 400 });
      }
      if (typeof payload === "object" && payload !== null) {
        const record = payload as Record<string, unknown>;
        if (
          typeof record.type === "string" &&
          record.type === "block_actions" &&
          Array.isArray(record.actions)
        ) {
          const first = record.actions[0] as Record<string, unknown>;
          if (
            typeof first.value === "string"
          ) {
            const actionPayload = payload as unknown as BlockActionPayload;
            void openPinModal({
              triggerId: actionPayload.trigger_id,
              endpointJson: actionPayload.actions[0].value,
            });
          }
        }
      }
      return new Response("", { status: 200 });
    }

    // ─── 5) Fallback ────────────────────────────────────────────────
    return new Response("", { status: 200 });
  },
};
