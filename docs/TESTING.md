# Testing

## What runs automatically

```bash
cd ~/Projects/proworkflow-hub_2 && npm test && npm run typecheck && npm run build
```

`npm test` runs 83 tests in about two seconds:

| File | Covers |
|---|---|
| `tests/core.test.ts` | Sender check, subject and body parsing, configurable patterns, comment extraction, classification examples from the brief, grouping, status rules, search, a 45-message campaign |
| `tests/graph.test.ts` | The Graph layer against a simulated Graph service: paged import, sender filtering, throttling and Retry-After, token refresh, batches of 20, partial failure, archive, sync, the degraded-sync fallback |
| `tests/store.test.ts` | The whole flow on the sample mailbox: import, Review & Clear, resolve, mark unread, partial failure and retry, archive, new mail arriving, emails deleted or read in Outlook, manual grouping, rule changes |

How the brief's scenarios map to tests:

| Scenario | Where |
|---|---|
| Multiple emails from the same client | core: "groups by client code then project ID" |
| Multiple campaigns for the same client | core: same test, plus "keeps same-named campaigns of different clients apart" |
| Different senders within the same campaign | store: "builds the 42-message campaign" |
| Emails containing only acknowledgments | core: classification; sample campaign "Digital Ads OCT 2026" |
| Emails containing approvals | core: classification, including approval-with-a-request |
| Missing client codes | core: "flags a missing client code" |
| Unfamiliar subject formats | core: "flags unfamiliar formats", "falls back without losing text" |
| 40+ message conversations | core: "handles a 40+ message campaign"; store: 42-message campaign |
| Bulk mark-as-read | graph: "marks 45 emails as read in batches of 20"; store: "Review & Clear" |
| Bulk archive | graph: "archives by moving to the well-known archive folder"; store: "archives selected emails" |
| New emails arriving while open | store: "picks up new mail", "a new message reopens a reviewed campaign" |
| Outlook for Mac compatibility | **Not automatable. See the live checklist below.** |

## Preview mode

`https://localhost:3005/taskpane.html?preview=1` runs the complete interface on the sample mailbox.
Nothing is saved, so each reload starts at the import screen. **Simulate new email** drops a new
notification in, to show a quiet campaign reopening.

## Live checklist (not yet done)

None of this could be run in the build environment: there was no Outlook client and no tenant. Run
it in this order after `docs/SETUP.md`. Stop at the first failure and send me what you see.

Use a quiet campaign for the write tests, or a test mailbox with a few forwarded notifications.

**Loading and sign-in**

- [ ] 1. The add-in appears in Outlook for Mac and the pane opens on a selected email.
- [ ] 2. The pane opens with **no** email selected.
- [ ] 3. After pinning, the pane stays open while selecting other emails and switching folders.
- [ ] 4. Sign-in completes without asking for a password (a one-time consent prompt is fine).
- [ ] 5. The import screen shows the correct mailbox address.

**Reading**

- [ ] 6. Import "Last 30 days". The progress count rises and finishes. Note the email total and compare
      it with a search for `from:reply@notify.proworkflow.com` in Outlook over the same period.
- [ ] 7. Open three campaigns and compare each with its emails in Outlook: right client, right
      campaign name, every email present, nothing from another campaign.
- [ ] 8. The comment text is clean: no banner, no signature, no repeated project details.
- [ ] 9. Check what landed in Uncategorized and why. This is where a wrong assumption about the
      subject format will show up.

**Writing (changes real emails)**

- [ ] 10. Mark one email as read from the pane. It turns read in Outlook's message list.
- [ ] 11. Mark it unread again. It turns unread in Outlook.
- [ ] 12. **Review & Clear** on a small campaign. All its emails turn read in Outlook.
- [ ] 13. Archive two emails. They move to Archive in Outlook and stay in the conversation, tagged
       Archived.
- [ ] 14. **Open in Outlook** opens the original email.

**Staying in sync**

- [ ] 15. Read an email directly in Outlook. Within about a minute the pane shows it as read.
- [ ] 16. Have a new ProWorkflow notification arrive. Within about a minute it appears in the right
       campaign, once.
- [ ] 17. Move an email to another folder in Outlook. It stays in its campaign, once.
- [ ] 18. Delete an email in Outlook. It leaves the campaign after the next sync.
- [ ] 19. Quit and reopen Outlook. The pane comes back without re-importing, with review state intact.

**Other clients**

- [ ] 20. Outlook on the web: select an email, open the pane, pin it, repeat checks 7 and 12.

### The four checks most likely to fail, and what each would mean

| Check | Risk | If it fails |
|---|---|---|
| 2 | Opening with no email selected depends on the Outlook for Mac build | Select an email first. Nothing else changes |
| 8, 9 | The parser and extractor were written from one screenshot | Send me a few real subjects and bodies; the fix is a pattern change |
| 15 | Sync assumes that reading an email updates its last-modified time, and that Graph accepts a filter on last-modified plus sender | The provider already falls back to new-mail-only sync. I would add a targeted refresh of read state |
| 14 | Opening a specific email from a pinned pane with no item context | It already falls back to opening the email in Outlook on the web |
