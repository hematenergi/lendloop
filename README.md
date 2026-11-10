# LendLoop

**Borrow what you need. Lend what you don't.**

LendLoop is a small neighbourhood lending app for sharing tools and equipment. Neighbours can list items, request date-based loans, and manage the handoff with the owner. Clerk handles sign-in, while Convex stores listings and enforces access rules. Optional n8n workflows log request notifications and run daily overdue reminders.

## Features

- **Public:** Browse an intentionally limited catalogue showing item names and categories.
- **Signed-in users:** View item details, create and manage listings, request items, approve or decline incoming requests, cancel eligible requests, and mark approved loans returned.
- **Admins:** Review all loans and users, mark trusted lenders, and remove any listing.
- **Automation:** See reminder counts and the last reminder date on My requests.

## Architecture

~~~text
Browser ── UI ──> Next.js ── Clerk authentication
                    │
                    └── Convex queries and mutations
                              │
                              ├── HMAC-signed request event ──> n8n webhook
                              │
n8n ── Bearer GET /api/overdue ────────────────────────────────> Convex HTTP
n8n ── HMAC POST /api/reminders/ack ───────────────────────────> Convex HTTP
~~~

When a borrower creates, cancels, or changes a request, Convex schedules an event and sends a minimal JSON payload to n8n with an HMAC signature. The request workflow verifies the signature and event ID, deduplicates the event, and logs a mock notification. It returns HTTP 200 so Convex can record delivery.

The daily workflow runs at 08:00 in Asia/Jakarta, fetches approved loans whose end date has passed, and creates one reminder per loan. It logs a mock reminder, then signs a write-back for that request and date. Convex verifies the signature and updates reminder history idempotently.

## Tech stack

| Area | Technology |
| --- | --- |
| Web app | Next.js 15, React 19, TypeScript |
| Authentication | Clerk |
| Data and backend functions | Convex |
| Workflow automation | n8n |
| Local automation runtime | Docker Compose |

## Getting started

### Prerequisites

- Node.js 20 or newer and npm
- Free Clerk and Convex accounts
- Docker and Docker Compose, only if you want to run n8n locally

### Web app and Convex

1. Install dependencies:

   ~~~bash
   npm install
   ~~~

2. Copy the environment template and fill the Clerk keys and local sign-in routes:

   ~~~bash
   cp .env.example .env.local
   ~~~

3. Start Convex development from the repository root:

   ~~~bash
   npx convex dev
   ~~~

   Sign in to Convex and create or select a deployment when prompted. Set NEXT_PUBLIC_CONVEX_URL in .env.local to that deployment's public Convex URL. This command generates deployment-specific files under convex/_generated. The checked-in _generated files are handwritten placeholders so the repository can be type-checked before it is linked to a deployment.

4. In a second terminal, set the Convex deployment environment:

   ~~~bash
   npx convex env set WEBHOOK_HMAC_SECRET "<shared random secret>"
   npx convex env set CONVEX_HTTP_SECRET "<separate random secret>"
   npx convex env set N8N_REQUEST_WEBHOOK_URL "https://<reachable-host>/webhook/lendloop/request-events"
   npx convex env set ADMIN_CLERK_IDS "<clerk-user-id>"
   ~~~

   Generate and store both secrets securely. Use the same WEBHOOK_HMAC_SECRET and CONVEX_HTTP_SECRET in n8n. A hosted Convex deployment cannot reach localhost; the request webhook URL must be reachable from Convex, for example through a secured HTTPS tunnel during local development.

5. Start the web app:

   ~~~bash
   npm run dev
   ~~~

6. Sign up, then add listings from the dashboard to seed development data. There is no seed script.

To make an account an admin, set its Clerk user ID in ADMIN_CLERK_IDS before its Convex profile is first created. For an existing account, change that user's role field to admin in the Convex dashboard.

### n8n workflows

1. Copy the environment template for Docker Compose and fill the n8n values:

   ~~~bash
   cp .env.example .env
   ~~~

   Set N8N_ENCRYPTION_KEY to a strong random key and keep it stable. Set CONVEX_SITE_URL to the Convex deployment's HTTP actions URL (the .convex.site URL), and use the same HMAC and HTTP secrets configured in Convex.

2. Start only n8n:

   ~~~bash
   docker compose up -d n8n
   ~~~

3. In the n8n UI, use Workflows → Import from File to import the three files in n8n/. Import the error handler first. Select it as the error workflow for the other two if the imported name is not resolved automatically.

4. Activate the error handler, request notifications, and overdue reminders workflows. The request workflow's active webhook URL must match N8N_REQUEST_WEBHOOK_URL in the Convex deployment.

The notification nodes intentionally log mock payloads and do not send email. See n8n/README.md for credential and raw-body notes.

## Environment variables

Secrets belong in local ignored environment files or the Convex deployment environment. Never commit real secrets. Workflow JSON reads values from n8n's environment and contains no secret values.

### Next.js — .env.local

| Name | Required | Purpose |
| --- | --- | --- |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY | Yes | Clerk browser key |
| CLERK_SECRET_KEY | Yes | Clerk server key |
| NEXT_PUBLIC_CLERK_SIGN_IN_URL | Yes | Local sign-in route, normally /sign-in |
| NEXT_PUBLIC_CLERK_SIGN_UP_URL | Yes | Local sign-up route, normally /sign-up |
| NEXT_PUBLIC_CONVEX_URL | Yes | Public Convex deployment URL |

### Convex deployment and n8n — root .env for Compose

| Name | Set in | Required | Purpose |
| --- | --- | --- | --- |
| WEBHOOK_HMAC_SECRET | Convex and n8n | For request events and acknowledgements | Shared key for both HMAC directions |
| N8N_REQUEST_WEBHOOK_URL | Convex | For request notifications | Reachable n8n production webhook URL |
| CONVEX_HTTP_SECRET | Convex and n8n | For overdue reminders | Bearer key for GET /api/overdue |
| ADMIN_CLERK_IDS | Convex | No, unless using admin features | Comma-separated Clerk subject IDs granted admin role when profiles are created |
| N8N_ENCRYPTION_KEY | n8n | Yes | Encrypts credentials stored by n8n; keep stable |
| CONVEX_SITE_URL | n8n | For overdue reminders | Convex HTTP actions base URL, ending in .convex.site |

The Convex variables are set with the Convex CLI or dashboard. The n8n values are supplied to Docker Compose from the root .env file; .env is ignored by Git. The HMAC and bearer secrets must match across both environments.

## Security and design decisions

- **Authorization lives in Convex functions.** The UI hides controls, but each query or mutation checks the authenticated identity and ownership. Admin-only queries and actions call requireAdmin; request approval and decline require the lender; cancellation requires the borrower; return marking requires either party. Listing edits require the owner, while listing removal permits the owner or an admin.
- **Clerk authenticates; Convex authorizes.** Convex maps identity.subject to a user record and checks the server-stored role. ADMIN_CLERK_IDS seeds the admin role for a newly created profile; it does not change an existing profile automatically.
- **Data is minimized.** items.listPublic returns only name and category. The request webhook contains only the request dates and status, item name and category, recipient details needed by the notification, and actor name.
- **Service calls are authenticated.** Convex signs event payloads for n8n and verifies signed reminder acknowledgements. The overdue GET endpoint requires a bearer secret.
- **Retries and deduplication reduce repeat work.** Convex retries failed request webhook delivery. n8n uses eventId for request dedupe and retries supported nodes. Convex notification records use deterministic dedupe keys; reminder write-back deduplicates by request and date.
- **Failures remain visible.** Unhandled n8n failures invoke the shared error workflow. A failed reminder acknowledgement is retained on the execution's error output so other reminder items can continue.
- **Reminder activity is visible to borrowers.** My requests shows reminderCount and lastReminderDate when a reminder has been recorded.

## What I would change for production

- Verify webhook HMAC against byte-exact raw request bodies, with raw-body capture enabled or a gateway that preserves the bytes.
- Replace mock logs with an email provider or Slack integration backed by n8n credentials and delivery-status handling.
- Replace n8n workflow static data with durable, expiring idempotency storage that handles concurrent executions.
- Add a durable queue and dead-letter flow with safe replay for webhook and reminder failures.
- Add rate limiting and request-size limits to externally reachable webhook endpoints.
- Add an admin audit log and in-app notification history.
- Add Convex integration tests, alerting and monitoring for failed executions, and tested backups.
- Pin the n8n image version instead of using latest, then document upgrades and rollback.

## Project structure

~~~text
app/                  Next.js pages
components/           Shared React providers
convex/               Schema, queries, mutations, HTTP actions, and webhook actions
convex/_generated/    Handwritten type placeholders until linked to a deployment
lib/                  Shared frontend constants
n8n/                  Importable workflows and automation setup notes
docker-compose.yml    Local n8n service only
~~~

## Scripts

| Command | Purpose |
| --- | --- |
| npm run dev | Start the Next.js development server |
| npm run build | Build the production web app |
| npm run typecheck | Run TypeScript without emitting files |
