// Minimal example of a webhook receiver for web-chat.
//
// Point your app's Settings -> Webhook URL at wherever you run this, then
// hook the marked spot up to Linear/Jira/Asana/Slack/whatever you actually
// use for tickets. This intentionally has zero dependencies so you can
// paste it anywhere (or port the ~15 lines of verification logic into an
// existing Express/Fastify/Next route).
//
// Run: node examples/webhook-receiver.mjs
// Then set WEB_CHAT_SECRET below (or via env) to your app's secretKey.

import { createServer } from "node:http";
import { createHmac } from "node:crypto";

const SECRET = process.env.WEB_CHAT_SECRET ?? "sk_replace_me";
const PORT = process.env.PORT ?? 8787;

function verify(rawBody, signature, timestamp, secret, toleranceSeconds = 300) {
  const now = Math.floor(Date.now() / 1000);
  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return expected === signature;
}

createServer((req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405).end();
    return;
  }
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    const signature = req.headers["x-web-chat-signature"];
    const timestamp = req.headers["x-web-chat-timestamp"];
    if (!verify(raw, signature, timestamp, SECRET)) {
      res.writeHead(401).end("bad signature");
      return;
    }

    const event = JSON.parse(raw);
    console.log(`\n[web-chat webhook] ${event.type}`);
    console.log(JSON.stringify(event.data, null, 2));

    switch (event.type) {
      case "conversation.converted_to_ticket":
        // TODO: create the real ticket in Linear/Jira/Asana here, using
        // event.data.conversation, event.data.messages, event.data.context.
        // Then report back so the dashboard can link to it:
        //
        // await fetch(`${SERVER_URL}/api/conversations/${event.data.conversation.id}/ticket`, ...)
        // -- actually the callback endpoint is keyed by ticket id, see:
        // PATCH /api/tickets/:id/callback  { externalRef, externalUrl }
        break;
      default:
        break;
    }

    res.writeHead(200).end("ok");
  });
}).listen(PORT, () => console.log(`Webhook receiver listening on :${PORT}`));
