# LendLoop n8n workflows

These workflows are separate from the Next.js app. Docker Compose starts only n8n.

## Import and activate

1. Copy .env.example to the repository root as .env and set N8N_ENCRYPTION_KEY, WEBHOOK_HMAC_SECRET, CONVEX_HTTP_SECRET, and CONVEX_SITE_URL.
2. Start n8n with docker compose up -d n8n, then open http://localhost:5678.
3. In n8n, choose Workflows → Import from File and import error-handler.json first, then request-notification.json and overdue-reminders.json.
4. If n8n does not resolve the error workflow name during import, select LendLoop — Error handler in each workflow's Settings → Error Workflow.
5. Activate the error handler first, followed by the request notifications and overdue reminders workflows.

Set N8N_REQUEST_WEBHOOK_URL in the Convex deployment to the active request webhook URL. A hosted Convex deployment must be able to reach that URL; localhost is not reachable from Convex cloud.

## Environment

| Variable | Used by | Purpose |
| --- | --- | --- |
| N8N_ENCRYPTION_KEY | n8n | Stable key for encrypting n8n credentials |
| WEBHOOK_HMAC_SECRET | n8n and Convex | Shared request-event and reminder-acknowledgement HMAC key |
| CONVEX_HTTP_SECRET | n8n and Convex | Bearer key for GET /api/overdue |
| CONVEX_SITE_URL | n8n | Convex HTTP actions base URL |

The workflow exports contain no credentials or secret values. They read configuration from n8n's environment. In a deployed n8n instance, move the overdue Authorization header to an n8n Header Auth credential.

## Mock delivery and body signatures

Both notification workflows intentionally log message objects; they do not send email or chat messages. Replace the mock Code nodes with an Email, Slack, or Discord node and add the provider credential in n8n.

The request webhook falls back to JSON.stringify(body) when rawBody is unavailable. Enable raw-body capture on the Webhook node for byte-exact verification in a deployment. Convex currently serializes the event payload deterministically, so the fallback matches that payload. The reminder acknowledgement is sent as the exact JSON.stringify(body) string used to create its HMAC.

The n8n Code nodes use Node's built-in crypto module for HMAC. The daily reminder's failed acknowledgement items remain visible in that execution while the other items continue; unhandled workflow failures go to the shared error handler.
