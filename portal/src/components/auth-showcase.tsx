'use client';

import { ChatDemo, useChatScript } from './landing/chat-demo';

const points = ['No SMS codes or resend fees', 'Your own branded Telegram bot', 'Free sandbox with test customers'];

// The right half of the sign-in pages: Telegram night with the landing page's blue horizon.
export function AuthShowcase() {
  const count = useChatScript(2200);
  return (
    <div className="relative hidden overflow-hidden bg-[#01061a] lg:flex lg:flex-col lg:items-center lg:justify-center lg:px-14">
      <div className="pointer-events-none absolute inset-x-[-40%] top-[58%] h-[200%] rounded-[50%] bg-[radial-gradient(60%_12%_at_50%_0%,#10345a_0%,#071733_55%,#030b20_100%)] shadow-[0_-1px_0_rgba(200,238,255,0.85),0_-3px_14px_rgba(42,171,238,0.85),0_-24px_110px_rgba(42,171,238,0.38)]" />
      <div className="tg-doodles pointer-events-none absolute inset-0 opacity-[0.035] [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />

      <div className="relative mx-auto flex max-w-md flex-col items-center text-center">
        <h2 className="font-display text-[2.6rem] font-normal leading-[0.98] tracking-[-0.03em] text-white">
          No more OTP bills.
          <br />
          <span className="text-[rgb(226_233_255/0.55)]">Verify on Telegram.</span>
        </h2>
        <p className="mt-4 text-[15px] text-[rgb(226_233_255/0.74)]">{points.join(' · ')}</p>
        <div className="mt-10 scale-[0.9]">
          <ChatDemo count={count} />
        </div>
      </div>
    </div>
  );
}
