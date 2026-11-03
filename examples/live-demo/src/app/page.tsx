import { Demo } from './demo';

const REPO = 'https://github.com/sami-yesha/telenotify/tree/main/examples/live-demo';
const PORTAL = 'https://telenotify.duckdns.org';

export default function Page() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a href={PORTAL} className="flex items-center gap-2.5 font-semibold">
            <img src="/icon.svg" alt="" className="size-8" />
            <span>Telenotify</span>
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-dark">Live demo</span>
          </a>
          <nav className="flex items-center gap-2 text-sm">
            <a href={REPO} className="hidden rounded-lg px-3 py-2 font-medium text-muted hover:bg-canvas hover:text-ink sm:block">
              See the code
            </a>
            <a href={`${PORTAL}/signup`} className="rounded-lg bg-ink px-3 py-2 font-semibold text-white hover:bg-ink/85">
              Get an API key
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">See Telenotify work, for real.</h1>
          <p className="mt-3 text-base text-muted sm:text-lg">
            Verify your phone number with one tap in Telegram, then get real notifications in your own Telegram app. The dark panel shows what
            this app&apos;s server and Telenotify do at every step.
          </p>
        </div>
        <Demo repoUrl={REPO} />
      </main>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>A demo app built on the public Telenotify API, like any customer would build it.</p>
          <p>
            <a href={REPO} className="font-medium text-brand-dark hover:underline">
              Source code
            </a>{' '}
            ·{' '}
            <a href={PORTAL} className="font-medium text-brand-dark hover:underline">
              telenotify.duckdns.org
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
