'use client';

import { Bold, ChevronsDownUp, Code, EyeOff, Heading, Italic, Link, List, Quote, Strikethrough } from 'lucide-react';
import type { RefObject } from 'react';

type Action = { label: string; icon: React.ComponentType<{ className?: string }>; wrap?: [string, string]; line?: string; placeholder: string };

const ACTIONS: Action[] = [
  { label: 'Bold', icon: Bold, wrap: ['**', '**'], placeholder: 'bold' },
  { label: 'Italic', icon: Italic, wrap: ['_', '_'], placeholder: 'italic' },
  { label: 'Strikethrough', icon: Strikethrough, wrap: ['~~', '~~'], placeholder: 'old price' },
  { label: 'Spoiler (hidden until tapped)', icon: EyeOff, wrap: ['||', '||'], placeholder: 'secret' },
  { label: 'Tap to copy', icon: Code, wrap: ['`', '`'], placeholder: 'TX-88-4471' },
  { label: 'Link', icon: Link, wrap: ['[', '](https://)'], placeholder: 'label' },
  { label: 'Heading', icon: Heading, line: '# ', placeholder: 'Heading' },
  { label: 'List item', icon: List, line: '- ', placeholder: 'item' },
  { label: 'Quote', icon: Quote, line: '> ', placeholder: 'quote' },
  { label: 'Collapsible quote', icon: ChevronsDownUp, line: '>> ', placeholder: 'details shown on tap' },
];

// Inserts the formatting syntax from lib/rich-text around the selection.
export function FormatToolbar({ target, value, onChange }: { target: RefObject<HTMLTextAreaElement | null>; value: string; onChange: (value: string) => void }) {
  function apply(action: Action) {
    const el = target.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || action.placeholder;
    let insert: string;
    let from = start;
    let to = end;
    if (action.wrap) {
      insert = action.wrap[0] + selected + action.wrap[1];
    } else {
      // Line formats go at the start of each selected line (or the caret's line).
      from = value.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = value.indexOf('\n', start);
      to = end > start ? end : lineEnd === -1 ? value.length : lineEnd;
      insert = (value.slice(from, to) || action.placeholder)
        .split('\n')
        .map((line) => action.line + line)
        .join('\n');
    }
    const next = value.slice(0, from) + insert + value.slice(to);
    onChange(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const caret = action.wrap ? from + action.wrap[0].length : from + insert.length;
      el.setSelectionRange(caret, action.wrap ? caret + selected.length : caret);
    });
  }

  return (
    <div className="flex flex-wrap gap-0.5 rounded-t-xl border border-b-0 border-line bg-subtle/60 px-1.5 py-1">
      {ACTIONS.map((action) => (
        <button
          key={action.label}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => apply(action)}
          title={action.label}
          aria-label={action.label}
          className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-ink"
        >
          <action.icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
