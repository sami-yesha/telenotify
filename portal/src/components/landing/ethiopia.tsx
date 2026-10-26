import { Download, Languages, MessageCircleHeart, WifiOff } from 'lucide-react';
import { Reveal, SectionHeading } from './reveal';

const points = [
  {
    icon: MessageCircleHeart,
    title: 'Your customers are already there',
    body: 'In Ethiopia, Telegram is where people chat, follow businesses and get news. A message there gets read, not buried with promotional SMS.',
  },
  {
    icon: Download,
    title: 'Nothing to install',
    body: 'No new app, no account, no form. One tap on your link, one tap on Start, and they’re connected to your business.',
  },
  {
    icon: Languages,
    title: 'Amharic just works',
    body: 'Send in Amharic, Afaan Oromo, Tigrinya or English with no character-count surprises and no split messages.',
  },
  {
    icon: WifiOff,
    title: 'Never stuck without a plan',
    body: 'If someone isn’t on Telegram, or Telegram can’t reach them, you’re told instantly so your SMS fallback covers them.',
  },
];

export function Ethiopia() {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading
          eyebrow="Built for Ethiopia"
          title={
            <>
              Meet customers in the app <span className="text-gradient">they open every day.</span>
            </>
          }
          body="SMS was built for a world without chat apps. Your customers have moved on, and your notifications can too."
        />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {points.map((point, i) => (
            <Reveal key={point.title} delay={0.08 * i} className="rounded-3xl border border-line bg-surface p-6 shadow-soft">
              <span className="grid size-11 place-items-center rounded-2xl bg-brand-soft text-brand">
                <point.icon className="size-5" />
              </span>
              <h3 className="mt-4 font-display text-lg font-medium tracking-tight text-ink">{point.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{point.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
