// Telegram's Bot Developer Terms require every bot to have an easily accessible
// privacy policy. Bots on Telenotify point to the "If a business messages you"
// section of our policy, which covers the data we process for the business.

/** e.g. https://telenotify.example.com/privacy#customers */
export function privacyUrl(portalUrl: string): string {
  return `${portalUrl.replace(/\/$/, '')}/privacy#customers`;
}

/** The reply to /privacy in any bot we run. */
export function privacyText(businessName: string, portalUrl: string): string {
  return (
    `🔒 How your data is handled\n\n` +
    `${businessName} sends you messages through Telenotify, an independent service that is not affiliated with Telegram. ` +
    `We keep only what's needed to deliver them: the ID ${businessName} uses for you, your Telegram chat ID, ` +
    `your phone number if you share it, and the messages themselves.\n\n` +
    `Block this bot at any time to stop messages. Full privacy policy: ${privacyUrl(portalUrl)}`
  );
}
