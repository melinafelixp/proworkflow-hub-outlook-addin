# ProWorkflow Hub

An Outlook add-in that turns dozens of separate ProWorkflow notification emails into one
conversation per campaign, grouped by client, with one-click "Review & Clear".

**Status: Phase 1 built and tested on sample data. Not yet run inside Outlook or against a real
mailbox.** See `docs/TESTING.md` for the live checklist.

## What it does

- Finds ProWorkflow notifications by sender address, wherever they are filed.
- Reads the client code, project ID and campaign name from the subject and the notification body.
- Groups by client, then campaign. Anything ambiguous goes to Uncategorized instead of being guessed.
- Shows each campaign as one conversation with only the comment text, the original one click away.
- Marks emails read or unread and archives them in bulk, in the real mailbox, with a report of any
  that failed.
- Labels comments (action required, approval, acknowledgment, update, needs review) with rules that
  run on the device, and keeps a campaign flagged until its requests are resolved.
- Stays current while the pane is open.

## Quick start

```bash
npm install && cp .env.example .env && npm run certs && npm run dev-server
```

Then open https://localhost:3005/taskpane.html?preview=1 for the sample-data preview. To run it in
Outlook, follow `docs/SETUP.md`.

| Command | What it does |
|---|---|
| `npm run dev-server` | Local HTTPS server on port 3005 |
| `npm test` | 83 automated tests |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production build into `dist/` |
| `npm run validate` | Send `manifest.production.xml` to Microsoft's validator |
| `npm run certs` | Install the local HTTPS certificate (once per machine) |

## Documents

| File | Read it for |
|---|---|
| `docs/FEASIBILITY.md` | What Outlook allows, what it does not, and the open questions |
| `docs/ARCHITECTURE.md` | How it is built and why |
| `docs/SETUP.md` | Entra registration, running locally, loading into Outlook for Mac |
| `docs/DEPLOYMENT.md` | GitHub, Netlify, Microsoft 365 admin center, updating |
| `docs/TESTING.md` | Automated tests and the live checklist |

## Stack

React 18, TypeScript, Fluent UI v9, Office.js, MSAL (nested app authentication), Microsoft Graph,
webpack. No backend and no database. Light brand theme (primary `#003c46`, secondary `#00afaf`,
Questa Sans) defined in `src/ui/theme.ts`.

## Phases

- **Phase 1 (this build):** add-in structure, sign-in, mailbox access, sender identification,
  identifier extraction, grouping, conversation view, bulk read/unread/archive, search, history
  import, ongoing sync. Also included because the dashboard depends on them: rule-based
  classification, campaign status, manual status, review timestamps.
- **Phase 2:** live validation against real notifications, review state shared across devices,
  optional Outlook categories, classification tuning from real corrections.
- **Phase 3:** AI summaries and action detection (needs a backend and an approved data-handling
  arrangement), ProWorkflow API integration.
