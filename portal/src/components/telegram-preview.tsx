'use client';

import { ExternalLink, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { toTelegramHtml, type MessageFormat } from '@/lib/rich-text';

export interface PreviewButton {
  text: string;
  url?: string;
}

// How a message will look in Telegram. Formatted text goes through the same
// converter the API uses, so this matches what the customer gets.
export function TelegramPreview({
  text,
  format = 'plain',
  botName = 'Your bot',
  buttons = [],
  sandboxTag,
  className,
}: {
  text: string;
  format?: MessageFormat;
  botName?: string;
  buttons?: PreviewButton[][];
  /** Org name, shown the way sandbox messages are labelled. */
  sandboxTag?: string;
  className?: string;
}) {
  const [dark, setDark] = useState(true);
  const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const empty = !text.trim();
  // Safe to inject: the converter escapes all input and only emits Telegram's own tags.
  const html = format === 'markdown' ? toTelegramHtml(text) : escapeHtml(text);
  const rows = buttons.filter((row) => row.some((b) => b.text.trim()));

  return (
    <div className={cn('overflow-hidden rounded-xl border border-line', className)}>
      <div className={cn('flex items-center gap-3 px-4 py-2.5', dark ? 'bg-[#17212b]' : 'bg-white border-b border-slate-200')}>
        <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-xs font-bold text-white">{botName.charAt(0).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-semibold', dark ? 'text-white' : 'text-slate-900')}>{botName}</p>
          <p className={cn('text-[11px]', dark ? 'text-sky-300/80' : 'text-sky-600')}>bot</p>
        </div>
        <button
          type="button"
          onClick={() => setDark(!dark)}
          className={cn('rounded-lg p-1.5', dark ? 'text-slate-400 hover:bg-white/5 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900')}
          aria-label={dark ? 'Show light theme' : 'Show dark theme'}
          title={dark ? 'Light theme' : 'Dark theme'}
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </div>
      <div className={cn('flex min-h-40 flex-col justify-end px-3 py-4', dark ? 'bg-[#0e1621]' : 'bg-[#c9d7e3]')}>
        <div className="max-w-[88%] self-start">
          <div className={cn('rounded-2xl rounded-bl-md px-3 py-2 text-[14px] leading-[1.4] shadow-sm', dark ? 'bg-[#182533] text-white' : 'bg-white text-slate-900')}>
            {empty ? (
              <span className={dark ? 'text-slate-500' : 'text-slate-400'}>Your message appears here</span>
            ) : (
              <>
                {sandboxTag && <span className="block">[SANDBOX · {sandboxTag}]</span>}
                <span className={cn('tg-rich whitespace-pre-wrap break-words', dark ? 'tg-dark' : 'tg-light')} dangerouslySetInnerHTML={{ __html: html }} />
              </>
            )}
            <span className={cn('float-right ml-3 mt-1.5 text-[11px]', dark ? 'text-white/40' : 'text-slate-400')}>{time}</span>
          </div>
          {rows.map((row, i) => (
            <div key={i} className="mt-1 flex gap-1">
              {row
                .filter((b) => b.text.trim())
                .map((b, j) => (
                  <span
                    key={j}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1.5 truncate rounded-xl px-3 py-1.5 text-[13px] font-medium',
                      dark ? 'bg-[#182533]/80 text-white' : 'bg-white/60 text-slate-900',
                    )}
                  >
                    {b.text} <ExternalLink className="size-3 shrink-0 opacity-60" />
                  </span>
                ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
