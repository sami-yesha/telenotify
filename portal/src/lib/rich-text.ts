// Formatted messages and layouts: one source text, rendered three ways.
//   toTelegramHtml → what the bot sends (parse_mode HTML)
//   toPlainText    → SMS fallback and webhooks
//   renderLayout   → a layout object written out in the same syntax
//
// Pure and dependency-free: portal/src/lib/rich-text.ts is an exact copy used for
// the live preview, and a test keeps the two identical. Edit both together.
//
// Syntax (only when format is "markdown"):
//   **bold**   _italic_   ~~strike~~   ||spoiler||   `tap to copy`   [label](https://…)
//   # Heading line       - list item       > quote       >> collapsible quote
//   ``` on its own line opens and closes a pre-formatted block
//   \* escapes any of the characters above

export type MessageFormat = 'plain' | 'markdown';

export const LAYOUT_TYPES = ['receipt', 'alert', 'reminder', 'status', 'info'] as const;
export type LayoutType = (typeof LAYOUT_TYPES)[number];

export const LAYOUT_EMOJI: Record<LayoutType, string> = { receipt: '✅', alert: '⚠️', reminder: '⏰', status: '📦', info: 'ℹ️' };

export interface LayoutRow {
  label: string;
  value: string;
  /** Shown as tap-to-copy, e.g. a reference number. */
  copy?: boolean;
}

export interface Layout {
  type: LayoutType;
  title: string;
  /** Overrides the type's emoji; "" for none. */
  emoji?: string;
  /** A paragraph under the title. Formatting allowed. */
  body?: string;
  rows?: LayoutRow[];
  footer?: string;
}

const SPECIAL = /[\\`*_~|[\]()>#-]/g;

/** Makes a value (a template param, a layout value) show up literally. */
export function escapeMarkdown(value: string): string {
  return value.replace(SPECIAL, (c) => `\\${c}`);
}

export function renderLayout(layout: Layout): string {
  const emoji = layout.emoji ?? LAYOUT_EMOJI[layout.type] ?? '';
  const parts = [`${emoji ? `${emoji} ` : ''}**${escapeMarkdown(layout.title.trim())}**`];
  if (layout.body?.trim()) parts.push(layout.body.trim());
  if (layout.rows?.length) {
    parts.push(
      layout.rows
        .map((row) => {
          const label = escapeMarkdown(row.label.trim());
          const value = row.copy ? `\`${escapeMarkdown(row.value.trim())}\`` : `**${escapeMarkdown(row.value.trim())}**`;
          return `${label}: ${value}`;
        })
        .join('\n'),
    );
  }
  if (layout.footer?.trim()) parts.push(`_${escapeMarkdown(layout.footer.trim())}_`);
  return parts.join('\n\n');
}

// ---------- Rendering ----------

interface Rendered {
  html: string;
  plain: string;
}

const unescape = (s: string) => s.replace(/\\([\\`*_~|[\]()>#-])/g, '$1');

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toTelegramHtml(source: string): string {
  return renderBlocks(source).html;
}

export function toPlainText(source: string): string {
  return renderBlocks(source).plain;
}

/** What a message reads as without formatting, whatever its format. */
export function plainTextOf(text: string, format: MessageFormat | string | null | undefined): string {
  return String(format).toLowerCase() === 'markdown' ? toPlainText(text) : text;
}

function renderBlocks(source: string): Rendered {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  const plain: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ``` pre-formatted block: content kept exactly as written.
    if (/^```\s*$/.test(line)) {
      const end = lines.findIndex((l, j) => j > i && /^```\s*$/.test(l));
      if (end !== -1) {
        const content = lines.slice(i + 1, end).join('\n');
        html.push(`<pre>${escapeHtml(content)}</pre>`);
        plain.push(content);
        i = end;
        continue;
      }
    }

    // Consecutive > (or >>) lines form one quote.
    const quote = /^(>>?) ?/.exec(line);
    if (quote) {
      const expandable = quote[1] === '>>';
      const marker = new RegExp(`^${expandable ? '>>' : '>(?!>)'} ?`);
      const group: string[] = [];
      while (i < lines.length && marker.test(lines[i])) group.push(lines[i++].replace(marker, ''));
      i--;
      const inner = group.map(renderInline);
      html.push(`<blockquote${expandable ? ' expandable' : ''}>${inner.map((r) => r.html).join('\n')}</blockquote>`);
      plain.push(inner.map((r) => r.plain).join('\n'));
      continue;
    }

    const heading = /^#{1,3} +(.*)$/.exec(line);
    if (heading) {
      const r = renderInline(heading[1]);
      html.push(`<b>${r.html}</b>`);
      plain.push(r.plain);
      continue;
    }

    const item = /^[-*] +(.*)$/.exec(line);
    if (item) {
      const r = renderInline(item[1]);
      html.push(`• ${r.html}`);
      plain.push(`• ${r.plain}`);
      continue;
    }

    const r = renderInline(line);
    html.push(r.html);
    plain.push(r.plain);
  }
  // Telegram puts a line break after a blockquote/pre itself; drop ours to avoid a gap.
  return { html: html.join('\n').replace(/(<\/blockquote>|<\/pre>)\n/g, '$1'), plain: plain.join('\n') };
}

// Content of bold/strike/spoiler/italic: escaped pairs or anything but a backslash,
// so an escaped character next to the closing marker can't close it early.
const CONTENT = /((?:\\.|[^\\])+?)/.source;

const INLINE = new RegExp(
  [
    /\\([\\`*_~|[\]()>#-])/.source, // 1 escaped character
    /`((?:\\.|[^`\\\n])+)`/.source, // 2 code (escapes allowed, so a template value can hold a backtick)
    `\\*\\*${CONTENT}\\*\\*`, // 3 bold
    `~~${CONTENT}~~`, // 4 strike
    `\\|\\|${CONTENT}\\|\\|`, // 5 spoiler
    `(?<![\\p{L}\\p{N}\\\\])_(?!\\s)${CONTENT}(?<!\\s)_(?![\\p{L}\\p{N}])`, // 6 italic
    /\[([^\]\n]+)\]\(((?:https?|tg):\/\/[^\s)]+)\)/.source, // 7 label, 8 url
  ].join('|'),
  'u',
);

function renderInline(text: string): Rendered {
  let html = '';
  let plain = '';
  let rest = text;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      html += escapeHtml(rest);
      plain += rest;
      break;
    }
    html += escapeHtml(rest.slice(0, m.index));
    plain += rest.slice(0, m.index);
    rest = rest.slice(m.index + m[0].length);

    if (m[1] !== undefined) {
      html += escapeHtml(m[1]);
      plain += m[1];
    } else if (m[2] !== undefined) {
      const code = unescape(m[2]);
      html += `<code>${escapeHtml(code)}</code>`;
      plain += code;
    } else if (m[7] !== undefined) {
      const label = renderInline(m[7]);
      html += `<a href="${escapeHtml(m[8])}">${label.html}</a>`;
      plain += label.plain === m[8] ? m[8] : `${label.plain} (${m[8]})`;
    } else {
      const [tag, content] = m[3] !== undefined ? ['b', m[3]] : m[4] !== undefined ? ['s', m[4]] : m[5] !== undefined ? ['tg-spoiler', m[5]] : ['i', m[6]];
      const inner = renderInline(content);
      html += `<${tag}>${inner.html}</${tag}>`;
      plain += inner.plain;
    }
  }
  return { html, plain };
}
