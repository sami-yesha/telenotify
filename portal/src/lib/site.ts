// Public address of the portal and landing page, for canonical links, the sitemap and share cards.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://telenotify.duckdns.org').replace(/\/$/, '');

export const SITE_NAME = 'Telenotify';
export const SITE_TITLE = 'Telenotify: customer notifications on Telegram, with one API call';
export const SITE_DESCRIPTION =
  'Send order updates, OTPs and receipts on Telegram from your own branded bot. One API call, a free sandbox, and an instant signal when you should fall back to SMS.';

export const GITHUB_URL = 'https://github.com/sami-yesha/telenotify';
export const FREE_MONTHLY_LIMIT = 1_000;
