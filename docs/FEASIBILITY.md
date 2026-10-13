# Technical feasibility

Checked against Microsoft's documentation on 9 October 2026. Sources are listed at the end.

**Bottom line:** ProWorkflow Hub can be built as a real Outlook add-in, and Outlook for Mac is the
best-supported client for it. One requested feature (a count badge on the Outlook button) is not
possible. Everything else is possible, with the limits below.

## The seven questions

| # | Question | Answer | Detail |
|---|---|---|---|
| 1 | Can the pane open without an email selected? | **Mac: yes. Web and new Outlook on Windows: no.** | The manifest setting `SupportsNoItemContext` (Mailbox requirement set 1.13) allows it. New Outlook for Mac supports sets 1.1 to 1.14, and classic Outlook on Windows supports it too. In Outlook on the web and new Outlook on Windows the add-in button only appears on a selected message, so the user selects any email first, then opens the pane. |
| 2 | Can the pane stay open while moving between emails? | **Yes, by pinning.** | Pinnable task panes work in Outlook on the web, new and classic Outlook on Windows, and Outlook on Mac 16.13 or later, for Microsoft 365 subscribers. The user clicks the pin once. Limits: not available on calendar items, and a pane pinned while reading does not carry over to composing. |
| 3 | Can Microsoft Graph read email across the whole mailbox? | **Yes.** | `GET /me/messages` covers every folder with a delegated permission. Filtering by sender and date is supported. |
| 4 | Can the add-in mark many emails as read? | **Yes.** | `PATCH /me/messages/{id}` with `isRead`, sent through JSON batching: up to 20 per batch, which Graph feeds to Outlook four at a time. |
| 5 | Can the add-in archive many emails? | **Yes.** | `POST /me/messages/{id}/move` with `destinationId: "archive"`, also batched. |
| 6 | Can the add-in show a count or badge on its Outlook button? | **No.** | An add-in button has a label, a tooltip and static icons. Microsoft documents no way to put a number on it or to change it from a running pane. |
| 7 | Does Outlook for Mac support this? | **Yes, with three conditions.** | (a) New Outlook for Mac. (b) The add-in must use the XML ("add-in only") manifest, because the newer unified manifest is not supported on Mac. (c) Single sign-on needs Outlook for Mac 16.89 or later. |

## What cannot be done as described, and what was built instead

**Badge on the Outlook button (not possible).**
Closest alternative, already built: the counts are the first thing in the pane (Needs attention,
Needs review, New activity, Up to date), and with the pane pinned they are always on screen. A later
option is tagging emails with an Outlook category such as "PWF: action needed" so the native message
list shows it. That writes to the mailbox, so it is left for Phase 2 and should be opt-in.

**Opening the pane with nothing selected on Outlook on the web and new Outlook on Windows (not possible).**
Alternative: select any email, open the pane, pin it. From then on it behaves the same as on Mac.

**Working while the pane is closed (not possible).**
An add-in pane only runs while it is open, and Outlook's documented add-in events do not include
new mail arriving. So there is no background sync and no alerting. When the pane opens it catches up in one
request, then checks every 60 seconds while visible. A server-side job could watch the mailbox
around the clock, but that needs a backend, a database and stored tokens, which the brief asks to
avoid. Not recommended unless the open-pane model proves insufficient.

**Delta queries as the sync method (possible, but a poor fit).**
Graph delta queries work per folder, cannot filter by sender, and cap a filtered query at 5,000
messages. ProWorkflow mail may sit in the Inbox, a "PWF" folder or Archive, and a move between
folders looks like a deletion to a per-folder delta. The add-in instead asks, mailbox-wide, for
ProWorkflow messages whose `lastModifiedDateTime` is newer than the last sync. One small request
returns new mail, read/unread changes and folder moves. Message IDs are requested in immutable form
so they survive moves, which is what prevents duplicates.

**Review status across devices (limited in Phase 1).**
Review timestamps, resolved action items and manual corrections are stored in Outlook's local
browser storage on the device. They do not follow the user from Outlook for Mac to Outlook on the
web. The email read state does, because that lives in the mailbox. If Chloe will use both, Phase 2
should move this small record into the mailbox or Supabase.

**Permanently deleted emails (partly handled).**
An email moved to Deleted Items disappears from the hub at the next sync. An email that is hard
deleted is only noticed when an action is attempted on it; it is then removed with a note.

## The mailbox question that decides deployment

The screenshot shows the notifications addressed to `Chloe@SonaRev.net`, in a second account next to
her `elevatemediahouse.com` account. An Outlook add-in is installed per mailbox and can only read the
mailbox it is running in. So:

- The add-in must be deployed to the **sonarev.net** mailbox.
- If sonarev.net is a separate Microsoft 365 tenant, the app registration must be multi-tenant (or
  made in that tenant), and an administrator of that tenant must deploy the add-in and approve its
  permissions. Your own admin cannot do it for them.
- If both domains are in one tenant, your admin handles everything as with your other add-ins.

The build defaults to the multi-tenant sign-in authority, which works either way.

## Permissions

| Permission | Type | Why | Admin consent |
|---|---|---|---|
| `User.Read` | Delegated | Read the signed-in user's name, to recognise their own comments. | Not required by Microsoft. |
| `Mail.ReadWrite` | Delegated | Read ProWorkflow notifications, set read/unread, move to Archive. `Mail.Read` is not enough for the last two. | Not required by Microsoft. |

Both are delegated, so the add-in can only ever reach the mailbox of the person signed in. No
application (tenant-wide) permission is requested, no client secret exists, and no password is seen
by the add-in. Many tenants switch off user consent; if yours does, the admin clicks "Grant admin
consent" once on the app registration. The manifest itself asks only for `ReadItem`.

`Mail.ReadWrite` cannot be narrowed to one sender. The restriction to ProWorkflow senders is
enforced by the add-in: every query filters on the approved sender list and every result is checked
again before it is used.

## Assumptions that rest on one screenshot

The parser was written from a single example email. These need checking against 5 to 10 real
notifications, ideally two campaigns of the same client:

1. The `MS-` number identifies the **campaign** (the ProWorkflow project), and the text after it in
   the subject ("Google Analytics Access Check") is a task inside that campaign.
2. The body's `Project` row always ends with the campaign name ("Omnichannel Marketing SEPT 2026").
3. The client code is the number after the last comma.
4. The comment always follows a line reading "<name> from <company> has sent you a message".
5. Whether Chloe's own comments come back to her as notifications. If they do, they are recognised
   by her display name and never counted as action items.

If any of these is wrong, the fix is a pattern change in Settings or `src/core/settings.ts`, not a
rewrite. Until an email matches with confidence it goes to Uncategorized, never into a guessed
campaign.

## What has and has not been tested

**Tested here:** 83 automated tests covering subject and body parsing, comment extraction,
classification, grouping, status rules, the Graph layer against a simulated Graph service (paging,
throttling, token refresh, batches of 20, partial failures, archive, sync) and the full flow on the
sample mailbox. The interface was driven through its main flows in a headless browser at 320 and
360 pixels wide.

**Not tested:** anything inside real Outlook or against a real mailbox. No tenant or Outlook client
was available in the build environment. The manifests are well-formed and follow Microsoft's
template, but Microsoft's online validator could not be reached, so `npm run validate` still needs
to be run. `docs/TESTING.md` lists the live checks in the order to run them.

## Sources

- [Activate your Outlook add-in without the Reading Pane enabled or a message selected](https://learn.microsoft.com/en-us/office/dev/add-ins/outlook/contextless)
- [Implement a pinnable task pane in Outlook](https://learn.microsoft.com/en-us/office/dev/add-ins/outlook/pinnable-taskpane)
- [Outlook JavaScript API requirement sets](https://learn.microsoft.com/en-us/javascript/api/requirement-sets/outlook/outlook-api-requirement-sets)
- [Compare Outlook add-in support in Outlook on Mac](https://learn.microsoft.com/en-us/office/dev/add-ins/outlook/compare-outlook-add-in-support-in-outlook-for-mac)
- [Enable single sign-on with nested app authentication](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/enable-nested-app-authentication-in-your-add-in)
- [Nested app auth requirement sets](https://learn.microsoft.com/en-us/javascript/api/requirement-sets/common/nested-app-auth-requirement-sets)
- [Action element (manifest reference)](https://learn.microsoft.com/en-us/javascript/api/manifest/action)
- [Get incremental changes to messages in a folder](https://learn.microsoft.com/en-us/graph/delta-query-messages)
- [Microsoft Graph throttling limits (Outlook service)](https://learn.microsoft.com/en-us/graph/throttling-limits)
- [Combine multiple requests with JSON batching](https://learn.microsoft.com/en-us/graph/json-batching)
- [Get immutable identifiers for Outlook resources](https://learn.microsoft.com/en-us/graph/outlook-immutable-id)
- [Sideload Outlook add-ins for testing](https://learn.microsoft.com/en-us/office/dev/add-ins/outlook/sideload-outlook-add-ins-for-testing)
