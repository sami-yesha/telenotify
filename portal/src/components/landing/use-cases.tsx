import { Bell, CalendarClock, CreditCard, GraduationCap, KeyRound, Package, Receipt, Truck, Wallet } from 'lucide-react';

const cases = [
  { icon: Package, label: 'Order updates' },
  { icon: KeyRound, label: 'Login codes (OTP)' },
  { icon: Truck, label: 'Delivery tracking' },
  { icon: Receipt, label: 'Payment receipts' },
  { icon: CalendarClock, label: 'Appointment reminders' },
  { icon: Wallet, label: 'Loan & bill reminders' },
  { icon: GraduationCap, label: 'Exam results' },
  { icon: CreditCard, label: 'Card & account alerts' },
  { icon: Bell, label: 'Service announcements' },
];

export function UseCases() {
  const row = [...cases, ...cases];
  return (
    <section className="border-y border-line py-8">
      <p className="text-center text-[13px] tracking-[-0.005em] text-muted">One API for every message your customers wait for</p>
      <div className="mask-fade-x mt-6 overflow-hidden">
        <div className="flex w-max animate-marquee gap-3 hover:[animation-play-state:paused]">
          {row.map(({ icon: Icon, label }, i) => (
            <span key={i} className="flex items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface px-4 py-2 text-sm text-ink">
              <Icon className="size-4 text-brand" /> {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
