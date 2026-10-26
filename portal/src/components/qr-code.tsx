'use client';

import { Download } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Button, CopyButton } from './ui';

// QR for a t.me connect link: print it on receipts, counters or posters.
export function ConnectQr({ url, filename, caption }: { url: string; filename: string; caption?: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } }).then(setDataUrl);
  }, [url]);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <div className="shrink-0 rounded-xl border border-line bg-white p-2 shadow-soft">
        {dataUrl ? <img src={dataUrl} alt="QR code for the Telegram connect link" className="size-40" /> : <div className="size-40 animate-pulse rounded-xl bg-slate-100" />}
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        {caption && <p className="text-sm text-muted">{caption}</p>}
        <div className="flex items-center gap-2 rounded-xl border border-line bg-subtle px-3 py-2">
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink">{url}</code>
          <CopyButton value={url} />
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={dataUrl ?? '#'} download={`${filename}.png`} aria-disabled={!dataUrl}>
            <Button type="button" variant="secondary" disabled={!dataUrl}>
              <Download className="size-4" /> Download PNG
            </Button>
          </a>
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-xl px-3 py-2 text-sm font-medium text-brand hover:bg-brand-soft">
            Open in Telegram
          </a>
        </div>
      </div>
    </div>
  );
}
