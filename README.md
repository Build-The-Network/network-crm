# RunTheNetwork CRM

Automation service for the free 90-day Network beta and the Ascension waitlist.

Single Node.js process. Three pollers run every 60 seconds. One health endpoint.

---

## What it does

| Poller | Trigger | Action |
|--------|---------|--------|
| **Pipeline Inference** | Notion row has empty `Pipeline Type` | Reads which Tally fields are populated → sets `Pipeline Type` + `Status` |
| **Invite Sender** | `Confirm Send` is checked + `Email Sent at` empty + Pipeline = "Network Beta" | Generates single-use Discord invite → sends invite email → marks row sent |
| **Reject Sender** | `Status` = "Rejected" + `Email Sent at` empty | Sends rejection email → marks row sent |

Tally cannot set static property values on submission, so the pipeline inference poller compensates by inferring intent from field presence:
- "Hours/Weekly Available" populated → **Network Beta** / Applied
- "Current Income" populated → **Ascension Waitlist** / Signed Up

---

## Architecture

```
server.js                  ← Boot, health endpoint, poller scheduler
├── lib/
│   ├── notion.js          ← Notion API wrapper (query, patch, create)
│   ├── discord.js         ← Discord bot: single-use invite generation
│   ├── email.js           ← nodemailer SMTP via Gmail App Password
│   └── logger.js          ← Structured logging + 1h error counter
├── pollers/
│   ├── pipeline-inference.js
│   ├── invite-sender.js
│   └── reject-sender.js
└── templates/
    ├── network-invite.txt
    ├── network-reject.txt
    └── ascension-acknowledge.txt
```

---

## Required environment variables

| Variable | Source | Notes |
|----------|--------|-------|
| `GMAIL_USER` | Google account | `your-address@gmail.com` |
| `GMAIL_APP_PASSWORD` | myaccount.google.com → Security → App Passwords | 16-char app password |
| `NOTION_TOKEN` | notion.so/my-integrations | Internal integration token |
| `NOTION_DB_ID` | Notion page URL | ID of the Contacts database |
| `DISCORD_BOT_TOKEN` | discord.com/developers | Bot needs Create Instant Invite permission |
| `DISCORD_SERVER_ID` | Discord → Developer Mode → right-click server | Guild ID |
| `DISCORD_CHANNEL_ID` | Discord → right-click channel → Copy ID | Channel where new members land |
| `PORT` | Railway auto-injects | Defaults to 3000 locally |

Copy `.env.example` to `.env` and fill in values for local dev.

---

## How Confirm Send works

1. Reviewer looks at a Network Beta applicant row in Notion
2. If they want to invite the person, they check the **Confirm Send** checkbox
3. The invite-sender poller catches it within 60 seconds:
   - Generates a single-use Discord invite (expires 24h)
   - Sends the invite email via Gmail
   - Writes the Discord invite URL back to the row
   - Unchecks **Confirm Send**
   - Stamps **Email Sent at** with today's date
4. If something fails, it retries on the next poll. After 3 consecutive failures, the error message is written to the **Notes** field so it surfaces in the Notion dashboard.

---

## How to check logs

Railway dashboard → runthenetwork-crm project → Deployments → click active deployment → Logs.

Every log line is prefixed: `[ISO timestamp] [LEVEL] [poller-name]`.

---

## How to update templates

Edit the `.txt` files in `/templates/`. Variables use `{{double_braces}}`.

Current variables per template:
- `network-invite.txt`: `{{name}}`, `{{discord_invite_url}}`, `{{expiry_hours}}`
- `network-reject.txt`: `{{name}}`
- `ascension-acknowledge.txt`: `{{name}}`

After editing: commit → push → Railway auto-redeploys.

---

## Local testing

```bash
cp .env.example .env
# fill in real values in .env
npm install
npm start
```

The service starts on port 3000. Hit `http://localhost:3000/health` to confirm it's running.

Pollers run immediately on startup and then every 60 seconds.

To test a specific poller without waiting, you can temporarily lower `POLL_INTERVAL_MS` in `server.js` or call `runOnce()` directly in a test script.

---

## Railway deployment

Railway auto-deploys when `main` branch is pushed. No manual steps needed.

Health check URL for Railway: `https://<service-domain>/health`

To update env vars: Railway dashboard → project → service → Variables.

---

## Health endpoint

```
GET /health
```

Returns:
```json
{
  "status": "ok",
  "uptime_seconds": 3600,
  "last_poll": {
    "pipeline_inference": "2026-05-24T12:00:00.000Z",
    "invite_sender": "2026-05-24T12:00:00.000Z",
    "reject_sender": "2026-05-24T12:00:00.000Z"
  },
  "errors_last_hour": 0
}
```

---

## Archive

Old $497-funnel CRM code (14-stage pipeline, interviews, Calendly, Stripe, Drive scoring) is preserved on the `archive/old-crm-497-funnel` branch at `github.com/Build-The-Network/CRM`.

---

## About this repository

A clean public copy of a private repository, with fresh history. The Network is no longer operating, so this is an archive of the work. No real credentials are included; .env.example holds placeholders only. All rights reserved.
