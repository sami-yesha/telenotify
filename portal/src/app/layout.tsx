import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from '@/lib/site';
import { themeInitScript } from '@/lib/theme';
import './globals.css';
import { RouteProgress } from '@/components/route-progress';

// Fonts ship with the code (src/fonts, SIL Open Font License) so builds never
// depend on downloading them from Google Fonts.
const geistMono = localFont({ src: '../fonts/GeistMono-Variable.woff2', variable: '--font-geist-mono', weight: '100 900', display: 'swap' });
// Google Sans Flex (Latin subset) for all text; Geist Mono for code.
const googleSans = localFont({ src: '../fonts/GoogleSansFlex-Latin.woff2', variable: '--font-google-sans', weight: '400 700', display: 'block' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ['Telegram notifications', 'Telegram API', 'SMS alternative', 'OTP', 'phone verification', 'Ethiopia', 'Amharic', 'Telegram bot API', 'transactional notifications'],
  openGraph: { type: 'website', siteName: SITE_NAME, url: SITE_URL, title: SITE_TITLE, description: SITE_DESCRIPTION, locale: 'en_US' },
  twitter: { card: 'summary_large_image', title: SITE_TITLE, description: SITE_DESCRIPTION },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-theme is set by the script before React loads, so React must not warn about it.
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${geistMono.variable} ${googleSans.variable} font-sans antialiased`}>
        <RouteProgress />
        {children}
      </body>
    </html>
  );
}
