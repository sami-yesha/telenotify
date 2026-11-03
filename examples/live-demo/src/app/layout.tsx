import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Telenotify live demo: verify with Telegram',
  description: 'Verify your phone number with one tap in Telegram and receive real notifications in English, Amharic, Afaan Oromo and Tigrinya. See every API call and webhook as it happens.',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = { themeColor: '#1a8ad4', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+Ethiopic:wght@400;600&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
