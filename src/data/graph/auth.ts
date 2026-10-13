import { createNestablePublicClientApplication, type IPublicClientApplication } from "@azure/msal-browser";
import { CONFIG } from "../../config";
import { AuthRequiredError, SetupError } from "../mailProvider";

/**
 * Sign-in through nested app authentication (NAA).
 *
 * Outlook brokers the sign-in for the account whose mailbox the add-in is running in, so the
 * user normally sees no prompt at all. No password, client secret or refresh token is handled
 * here. MSAL keeps the short-lived access token in memory and renews it silently.
 *
 * Delegated scopes, both consentable by the user unless the tenant restricts user consent:
 *   User.Read        display name, to recognise the user's own comments
 *   Mail.ReadWrite   read ProWorkflow notifications, set read/unread, move to Archive
 */
export const SCOPES = ["User.Read", "Mail.ReadWrite"];

export class GraphAuth {
  private pca: IPublicClientApplication | null = null;

  private async client(): Promise<IPublicClientApplication> {
    if (this.pca) return this.pca;
    if (!CONFIG.clientId) {
      throw new SetupError(
        "This build has no Microsoft Entra application ID. Set PWH_CLIENT_ID in .env and rebuild (see docs/SETUP.md)."
      );
    }
    const supported =
      typeof Office !== "undefined" && Office.context?.requirements?.isSetSupported("NestedAppAuth", "1.1");
    if (!supported) {
      throw new SetupError(
        "This version of Outlook does not support single sign-on for add-ins. Update Outlook (Mac 16.89 or later) and reopen ProWorkflow Hub."
      );
    }
    this.pca = await createNestablePublicClientApplication({
      auth: { clientId: CONFIG.clientId, authority: CONFIG.authority },
    });
    return this.pca;
  }

  /**
   * Get an access token for Microsoft Graph.
   * `interactive: false` never opens a window; it throws AuthRequiredError so the UI can show
   * a Reconnect button instead of interrupting the user from a background sync.
   */
  async getToken(options: { interactive: boolean; forceRefresh?: boolean }): Promise<string> {
    const pca = await this.client();
    const request = { scopes: SCOPES, forceRefresh: options.forceRefresh ?? false };
    try {
      return (await pca.acquireTokenSilent(request)).accessToken;
    } catch {
      if (!options.interactive) {
        throw new AuthRequiredError("Reconnect to Microsoft 365 to keep your campaigns up to date.");
      }
      // First-run consent, an expired session or MFA: any silent failure falls through to the prompt.
      try {
        return (await pca.acquireTokenPopup({ scopes: SCOPES })).accessToken;
      } catch (popupError) {
        const detail = popupError instanceof Error ? popupError.message : "Sign-in was cancelled.";
        throw new AuthRequiredError(`Sign-in did not complete. ${detail}`);
      }
    }
  }
}
