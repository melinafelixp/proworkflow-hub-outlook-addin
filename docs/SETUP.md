# Setup: run it on your Mac and test it in Outlook

Three parts. Part A needs someone who can create app registrations in Microsoft Entra (your
Microsoft 365 admin, or you if your account is allowed to). Parts B and C are yours.

You will never be asked for a password or a secret in this process. The only value you copy is the
Application (client) ID, which is a public identifier.

## Before you start

Answer this first, because Part A depends on it: **is sonarev.net in the same Microsoft 365 tenant
as elevatemediahouse.com?** Your admin can tell from the Microsoft 365 admin center under
Settings > Domains. If sonarev.net is listed there, it is the same tenant.

- Same tenant: follow the steps as written.
- Different tenant: an admin of the sonarev.net tenant must approve the permissions (Part A, step 6)
  and deploy the add-in there. Everything else is the same.

## Part A: register the app in Microsoft Entra (admin, about 5 minutes)

1. Go to https://entra.microsoft.com and sign in.
2. Open **App registrations** (under Entra ID, or Identity > Applications in older layouts), then **New registration**.
3. Fill in:
   - **Name:** `ProWorkflow Hub`
   - **Supported account types:** `Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant)`
   - **Redirect URI:** choose platform `Single-page application (SPA)` and enter `brk-multihub://localhost:3005`
4. Select **Register**. On the Overview page, copy the **Application (client) ID**.
5. Open **API permissions > Add a permission > Microsoft Graph > Delegated permissions**, tick
   `Mail.ReadWrite`, and select **Add permissions**. `User.Read` is already there. Add nothing else.
6. Select **Grant admin consent for <your organisation>** and confirm. Both rows should show a green
   tick. (If user consent is allowed in your tenant this step is optional, but doing it means Chloe
   never sees a consent prompt.)

Do **not** create a client secret or a certificate. The add-in does not use one.

What the redirect URI means: `brk-multihub://` tells Microsoft that Outlook is allowed to handle the
sign-in on the add-in's behalf. It is followed by the address the add-in is served from, with no
path. You will add a second one for the live site in `docs/DEPLOYMENT.md`.

## Part B: run it locally

Unzip into the git-connected folder, install, and create the settings file:

```bash
ls -lt ~/Downloads/proworkflow-hub*.zip | head -1 && mkdir -p ~/Projects/proworkflow-hub_2 && unzip -o ~/Downloads/proworkflow-hub.zip -d ~/Projects/proworkflow-hub_2 && cd ~/Projects/proworkflow-hub_2 && npm install && cp .env.example .env && ls -la .env .gitignore manifest.local.xml
```

Put the client ID from Part A into `.env` (replace the placeholder with the real value):

```bash
cd ~/Projects/proworkflow-hub_2 && sed -i '' 's/^PWH_CLIENT_ID=.*/PWH_CLIENT_ID=PASTE-CLIENT-ID-HERE/' .env && grep -cE '^PWH_CLIENT_ID=[0-9a-fA-F-]{36}$' .env
```

The last command should print `1`. If it prints `0`, the value is not a client ID yet.

Install the local HTTPS certificate (asks for your Mac password once) and start the server:

```bash
cd ~/Projects/proworkflow-hub_2 && npm run certs && npm run dev-server
```

Leave that terminal tab running. Check the interface in a browser, with sample data:

https://localhost:3005/taskpane.html?preview=1

That page is safe to click around in: preview mode never signs in and never touches a mailbox.

## Part C: load it into Outlook for Mac

1. In a browser, sign in to Outlook on the web **as the mailbox that receives the ProWorkflow
   notifications**, then open https://aka.ms/olksideload. The "Add-Ins for Outlook" dialog opens
   after a few seconds.
2. Select **My add-ins**, scroll to **Custom Addins**, select **Add a custom add-in > Add from File**.
3. Choose `~/Projects/proworkflow-hub_2/manifest.local.xml` and accept the prompt.
4. Quit and reopen Outlook for Mac. Select that account's Inbox.
5. Open the add-in: select an email, then choose **ProWorkflow Hub (Local)** from the toolbar (it may
   be under the **...** overflow menu). On Mac it can also be opened with no email selected.
6. Select the **pin** icon at the top of the pane so it stays open as you move between emails.
7. The pane signs in through Outlook. If a consent window appears, accept it. Choose a history range
   and select **Organize my notifications**. The import only reads.

`manifest.local.xml` has its own ID and name, so it can sit alongside the production add-in later.

To remove it: https://aka.ms/olksideload > My add-ins > Custom Addins > **...** > Remove.

## If something goes wrong

| What you see | Cause | Fix |
|---|---|---|
| "This build has no Microsoft Entra application ID" | `.env` is missing the client ID, or the server was started before it was added | Fix `.env`, stop the server with Ctrl+C, run `npm run dev-server` again |
| "This version of Outlook does not support single sign-on" | Outlook for Mac older than 16.89, or the legacy Mac interface | Update Outlook and switch on **New Outlook** |
| Sign-in window says the redirect URI does not match | The `brk-multihub://` entry is missing or has a path on it | Part A step 3: it must be exactly `brk-multihub://localhost:3005` |
| "Need admin approval" | User consent is off in the tenant | Part A step 6 |
| The pane is blank | The local server is not running, or the certificate is not trusted | Open https://localhost:3005/taskpane.html in Safari. If Safari warns about the certificate, run `npm run certs` again |
| The add-in does not appear in Outlook for Mac | Sideloaded to a different account, or Outlook not restarted | Repeat Part C signed in as the right mailbox, then restart Outlook |
| Emails land in Uncategorized | The real subject format differs from the example | Settings > Identifier rules > "Try a subject line". Send me two or three of those subjects |
