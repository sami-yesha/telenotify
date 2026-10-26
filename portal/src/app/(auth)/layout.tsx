import Link from 'next/link';
import { AuthShowcase } from '@/components/auth-showcase';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="relative flex flex-col px-5 py-8 sm:px-10">
        <div className="relative flex items-center justify-between">
          <Link href="/" className="w-fit">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
        <div className="relative flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="relative flex justify-center gap-4 text-xs text-muted">
          <span>© {new Date().getFullYear()} Telenotify</span>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
        </p>
      </div>
      <AuthShowcase />
    </div>
  );
}
