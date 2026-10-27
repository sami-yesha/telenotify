import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Is this bot real?',
  description: 'Check whether a Telegram bot belongs to a business verified by Telenotify before you share your phone number.',
};

export default function CheckLayout({ children }: { children: React.ReactNode }) {
  return children;
}
