# Architecture

One static web app, loaded by Outlook as a task pane. No backend, no database, no secrets.

```
Outlook (Mac / web / Windows)
  └─ task pane  ── taskpane.html + taskpane.js, hosted on Netlify
        │
        ├─ Office.js ............ which email is selected, open an email, sign-in broker
        ├─ MSAL (nested app auth)  short-lived Graph token for the signed-in mailbox
        └─ Microsoft Graph ...... read notifications, mark read/unread, move to Archive
        │
        └─ local storage on the device: settings, review state, message index
```

Why no backend: every operation is the signed-in user acting on their own mailbox, which delegated
Graph permissions cover directly from the browser. A server would add hosting, token storage and a
second copy of client data without adding a Phase 1 feature.

## Project layout

```
src/
  taskpane/         index.tsx (entry point), taskpane.html
  config.ts         build-time settings (client ID, authority), preview-mode switch
  core/             pure logic, no Outlook or network code
    types.ts          data shapes
    settings.ts       defaults, sender check, safe regex handling
    parser.ts         subject + "Project" row -> client code, project ID, names
    extract.ts        notification body -> the comment itself
    classifier.ts     rule-based categories; the seam for a future AI classifier
    pipeline.ts       one mailbox message -> one hub message
    grouping.ts       campaigns, clients, status rules, search
    dates.ts
  data/
    mailProvider.ts   the interface the app uses for a mailbox
    mockProvider.ts   sample mailbox (preview and tests)
    mockData.ts       invented notifications in the real layout
    storage.ts        localStorage + IndexedDB wrappers
    graph/
      auth.ts           nested app authentication
      graphClient.ts    token, retries, paging, JSON batching
      graphProvider.ts  import, sync, bulk actions against Graph
  state/hubStore.ts framework-free state and every user action
  ui/               React + Fluent UI screens
    theme.ts          brand colors, fonts and component finishes (the whole styling layer)
tests/              83 tests, including a simulated Graph service
manifest.local.xml       localhost:3005, its own ID, shows as "ProWorkflow Hub (Local)"
manifest.production.xml  the hosted site
```

The UI and the store only ever talk to `MailProvider`. Swapping the sample mailbox for the real one
is a one-line choice in `src/taskpane/index.tsx`, which is why the preview and the real add-in
behave the same.

## Identifying ProWorkflow email

Only the sender **address** is used, never the display name ("Kristin Sherman (PWF)" changes with
whoever commented). Each approved address gets its own Graph query, and every returned message is
checked again in code. Domains are also supported; they use mailbox search and are verified the same
way. Defaults live in `src/core/settings.ts`; each user can adjust their copy in Settings.

## Parsing and grouping

For each notification:

1. Read the `Project` row in the body, ProWorkflow's own project path:
   `IC MS-156727 - Phonak \ MS-156727 \ KOS/DANCHAK AUDIOLOGY, 20016174 \ Omnichannel Marketing SEPT 2026`
2. Read the subject:
   `IC MS-156727 - Google Analytics Access Check - PH- KOS/DANCHAK AUDIOLOGY, 20016174`
3. Combine them. The body wins for the project ID and the campaign name, because the subject may
   name a task. Client codes from subject and body must agree.

Grouping key: **client code + project ID**. Level 1 is the client code, level 2 the project.

A message is grouped automatically only when exactly one client code and one project ID were found
and nothing conflicts. Otherwise it goes to **Uncategorized** with the reason shown (no client code,
no project ID, more than one of either, subject and body disagree, unfamiliar format). The user can
file it under a campaign by hand. Wording is never used to group.

All three patterns (project ID, client code, brand prefix) are regular expressions in Settings, with
a live tester. An invalid pattern is never saved. Changing a pattern re-groups the loaded emails
immediately.

## Comment extraction

The plain-text body is requested from Graph. The comment is the text between the line
"<name> from <company> has sent you a message" and the signature block. Quoted replies, the
"Write ABOVE THIS LINE" banner and footers end the comment, so repeated text is never read as a new
comment. If the marker is missing, the whole text is shown (minus known banner lines) and labelled as
an unfamiliar layout. The original email is never altered, and "Show original" loads it from the
mailbox on demand into a locked-down frame (no scripts, no remote images).

## Classification and status

`classifier.ts` puts each comment into Action required, Approval, Acknowledgment, Update or Needs
review, with a confidence level. It runs on the device; no email text is sent to any AI service. It
leans toward Action and Needs review, since calling a real request a thank-you is the costly error.
An approval with a request attached is an action, not an approval. The user can correct any label.

Campaign status, in priority order:

1. A status set by hand holds until a newer message arrives.
2. Any unresolved action item: **Needs attention**
3. Any unclassifiable comment not yet looked at: **Needs review**
4. Any unread email: **New activity**
5. Otherwise: **Up to date**

Reading an email never resolves an action item. Only **Resolve** on that message, or a manual
status, does. One exception, applied once: at the very first import, a request in an email that was
already read is treated as handled. Without that, months of old requests would all appear open.

**Review & Clear** marks every email in the campaign as read in Outlook and records the time. It
does not archive and does not resolve action items.

## Import and sync

- **First run:** the user picks 30 days, 90 days, 6 months or 12 months. Messages arrive 50 per
  page, newest first, with a running count of emails, clients and campaigns.
- **Ongoing:** when the pane opens, every 60 seconds while it is visible, when the user moves to
  another email, and on the sync button. Each sync asks for ProWorkflow messages modified since the
  last one, with a two-minute overlap.
- **Duplicates:** messages are keyed by immutable Graph ID, so the same email is never shown twice,
  including after it moves folders.
- **Throttling and failures:** requests go one at a time. 429 and 503 responses are retried using
  the Retry-After header. An expired token is refreshed once; if that fails the pane keeps showing
  what it has, with the last sync time and a Reconnect button. A failed sync shows a Retry button.

## Bulk actions

Mark read, mark unread and archive go through Graph JSON batches of 20, and change the real emails.
Read state updates on screen immediately and is put back for any email Graph rejected. The result
names how many succeeded and failed, with a "Retry N failed" button. Archive asks for confirmation
first; archived emails stay visible in the conversation, tagged Archived. Nothing is ever deleted.

## Data and privacy

Stored on the device, per mailbox address:

| Where | What |
|---|---|
| localStorage | Settings, review timestamps, resolved action items, manual corrections |
| IndexedDB | Message index: Graph message ID, sender name, date, read state, identifiers, classification, and the extracted comment text (kept so search works without rescanning the mailbox) |

Not stored: full email bodies, attachments, tokens, passwords. Nothing is sent anywhere except
Microsoft Graph. Two accounts on one machine have separate stores. "Clear local data" in Settings
removes all of it without touching the mailbox.

## Branding

The look is defined in one place, `src/ui/theme.ts`, on top of Fluent UI. The interface is light
only.

| Role | Value | Used for |
|---|---|---|
| Primary | `#003c46` | Headings, section titles, primary buttons, checked controls, focus rings, the strip at the top of the pane |
| Secondary | `#00afaf` | Hover borders, selected tints, outlines of secondary buttons, unread markers, the "New activity" dot |
| Secondary for text | `#007c7c` | Links and small teal labels. `#00afaf` on white is 2.7:1, too low for text, so text uses this darker shade (5.1:1) |
| Text | `#21231f` | Body text |
| Backgrounds | `#ffffff`, `#f6f8f8` | Cards and headers on white, the pane canvas on a very light neutral |

Red, green and amber stay reserved for status (needs attention, up to date, needs review), so a
brand color never has to mean "something is wrong".

Fonts are Questa Sans, served from `assets/fonts/` and declared in `src/taskpane/taskpane.html`.
Bold is used for headings, section titles and key callouts (client names, counts, unread senders).
Regular is used for everything else, including buttons, labels and inputs. Figures are set to
lining style, because Questa Sans defaults to old-style figures, which read poorly in codes and
counts. Confirm that your Questa Sans licence covers serving the font files from a website.

To change a color or the font, edit `BRAND` or `FONT_STACK` in `theme.ts`. The toolbar icons are
drawn by `scripts/make-icons.py`.

## Where later phases plug in

- **AI classification or summaries:** implement the `Classifier` interface, or add a summariser next
  to it. Needs a backend to hold the API key, and an approved data-handling arrangement first.
- **Review state on every device:** replace the `small` store in `storage.ts`.
- **ProWorkflow API:** an additional provider for project names and approval state.
