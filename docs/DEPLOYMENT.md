# Deployment: make it available to the team

Same pattern as your other add-ins: GitHub, Netlify, then the manifest goes to your Microsoft 365
admin. Steps marked **(admin)** need Microsoft 365 administrator access.

## 1. Put the project on GitHub

Create an empty private repository named `proworkflow-hub-outlook-addin` on GitHub, then:

```bash
cd ~/Projects/proworkflow-hub_2 && git init && git add -A && git commit -m "ProWorkflow Hub: Phase 1" && git branch -M main && git remote add origin https://github.com/melinafelixp/proworkflow-hub-outlook-addin.git && git push -u origin main
```

`.env` is in `.gitignore` and is not committed. Confirm with:

```bash
cd ~/Projects/proworkflow-hub_2 && git ls-files | grep -c '^\.env$'
```

That should print `0`.

## 2. Host it on Netlify

1. Netlify > **Add new site > Import an existing project** > pick the repository.
2. Build settings are read from `netlify.toml` (build command `npm run build`, publish folder `dist`).
3. **Site configuration > Environment variables**, add:
   - `PWH_CLIENT_ID` = the Application (client) ID
   - `PWH_AUTHORITY` = `https://login.microsoftonline.com/organizations`
4. **Deploys > Trigger deploy > Deploy site**. Note the site address, for example
   `https://pwf-hub-emh.netlify.app`.
5. Check it: open `https://YOUR-SITE.netlify.app/taskpane.html?preview=1`. You should see the
   sample-data preview.

The environment variables are baked in at build time, so changing one needs a new deploy.

## 3. Allow the live address to sign in (admin)

Entra > App registrations > ProWorkflow Hub > **Authentication** > under Single-page application,
**Add URI**: `brk-multihub://YOUR-SITE.netlify.app` (no `https://`, no path). Save.

## 4. Production manifest

`manifest.production.xml` already points at `https://emh-proworkflow-hub.netlify.app`. Validate it
before sending it to your admin:

```bash
cd ~/Projects/proworkflow-hub_2 && grep -c 'emh-proworkflow-hub.netlify.app' manifest.production.xml && npm install && npm run validate
```

The first number must be `7`. `npm run validate` sends the manifest to Microsoft's validation
service; fix anything it reports before going further.

## 5. Deploy through Microsoft 365 (admin)

1. https://admin.microsoft.com > **Settings > Integrated apps > Upload custom apps**.
2. App type **Office Add-in**, choose **Upload manifest file (.xml) from device**, select
   `manifest.production.xml`.
3. **Assign users:** choose **Specific users/groups** and add Chloe. Add others later the same way.
4. Accept the permissions and finish.

The add-in can take up to 24 hours to appear in Outlook, though it is usually much faster. Chloe then
opens it, pins it, and runs the first import.

If the mailbox is in a different tenant (see `docs/SETUP.md`), steps 3 and 5 are done by that
tenant's admin, who also approves the permissions the first time someone signs in.

## 6. Updating after deployment

**Code changes** (anything under `src/`): no admin involved. Netlify redeploys on push and Outlook
picks up the new pane the next time it is opened.

```bash
ls -lt ~/Downloads/proworkflow-hub*.zip | head -1 && unzip -o ~/Downloads/proworkflow-hub.zip -d ~/Projects/proworkflow-hub_2 && cd ~/Projects/proworkflow-hub_2 && npm install && npm test && git add -A && git commit -m "Describe the change" && git push
```

If a change does not show up, check the build and the deploy before anything else: confirm the
Netlify deploy finished, then quit and reopen Outlook.

**Manifest changes** (name, icon, button, URLs, permissions): raise `<Version>` in
`manifest.production.xml` (for example `1.0.0.0` to `1.0.1.0`), run `npm run validate`, and send the
file to your admin to upload under Integrated apps > ProWorkflow Hub > **Update add-in**.

**Changing the default senders or patterns for everyone:** edit `DEFAULT_SETTINGS` in
`src/core/settings.ts` and push. Users who have changed a setting themselves keep their own value.

## Adding more people

Nothing in the code is tied to Chloe. Each person signs in as themselves and sees only their own
mailbox, and their index is stored on their own device. To add someone, the admin adds them under
Integrated apps > ProWorkflow Hub > Users.
