import { readFileSync } from 'fs';
import { join } from 'path';
import { escapeMarkdown, plainTextOf, renderLayout, toPlainText, toTelegramHtml } from './rich-text';

describe('toTelegramHtml', () => {
  it('formats inline styles', () => {
    expect(toTelegramHtml('**Paid** _today_ ~~late~~ ||1234|| `TX-88`')).toBe('<b>Paid</b> <i>today</i> <s>late</s> <tg-spoiler>1234</tg-spoiler> <code>TX-88</code>');
  });

  it('nests styles and builds safe links', () => {
    expect(toTelegramHtml('**Order _1042_**')).toBe('<b>Order <i>1042</i></b>');
    expect(toTelegramHtml('[Track **now**](https://shop.et/o?id=1&x=2)')).toBe('<a href="https://shop.et/o?id=1&amp;x=2">Track <b>now</b></a>');
    expect(toTelegramHtml('[bad](javascript:alert(1))')).toBe('[bad](javascript:alert(1))');
  });

  it('escapes HTML so nothing can break the message', () => {
    expect(toTelegramHtml('<b>hi</b> & "you"')).toBe('&lt;b&gt;hi&lt;/b&gt; &amp; &quot;you&quot;');
    expect(toTelegramHtml('**unclosed bold')).toBe('**unclosed bold');
  });

  it('leaves snake_case and lone markers alone', () => {
    expect(toTelegramHtml('order_id_55 and 5 * 3 and a-b')).toBe('order_id_55 and 5 * 3 and a-b');
  });

  it('honours escapes, even next to a closing marker', () => {
    expect(toTelegramHtml('\\*\\*not bold\\*\\*')).toBe('**not bold**');
    expect(toTelegramHtml(`**${escapeMarkdown('5*')}**`)).toBe('<b>5*</b>');
    expect(toTelegramHtml(`_${escapeMarkdown('a_b')}_`)).toBe('<i>a_b</i>');
  });

  it('fills escaped values into tap-to-copy spans literally', () => {
    expect(toTelegramHtml(`Ref: \`${escapeMarkdown('TX-88_`x`')}\``)).toBe('Ref: <code>TX-88_`x`</code>');
    expect(toPlainText(`\`${escapeMarkdown('TX-88')}\``)).toBe('TX-88');
  });

  it('renders headings, lists, quotes, collapsible quotes and pre blocks', () => {
    const source = ['# Receipt', '- one', '- two', '> said', '> twice', '>> hidden', '>> more', '```', 'a  <b>', '```', 'end'].join('\n');
    expect(toTelegramHtml(source)).toBe(
      '<b>Receipt</b>\n• one\n• two\n<blockquote>said\ntwice</blockquote><blockquote expandable>hidden\nmore</blockquote><pre>a  &lt;b&gt;</pre>end',
    );
  });
});

describe('toPlainText', () => {
  it('drops the markers and spells out links for SMS', () => {
    expect(toPlainText('**Paid** `TX-88` [Track](https://shop.et/o/1)\n> note\n- item')).toBe('Paid TX-88 Track (https://shop.et/o/1)\nnote\n• item');
    expect(toPlainText('[https://shop.et](https://shop.et)')).toBe('https://shop.et');
  });

  it('only converts markdown messages', () => {
    expect(plainTextOf('**x**', 'MARKDOWN')).toBe('x');
    expect(plainTextOf('**x**', 'PLAIN')).toBe('**x**');
  });
});

describe('renderLayout', () => {
  const receipt = renderLayout({
    type: 'receipt',
    title: 'Payment received',
    rows: [
      { label: 'Amount', value: '1,250 ETB' },
      { label: 'Reference', value: 'TX-88-4471', copy: true },
    ],
    footer: 'Abebe Pharmacy',
  });

  it('writes a layout out as formatted text', () => {
    expect(toTelegramHtml(receipt)).toBe('✅ <b>Payment received</b>\n\nAmount: <b>1,250 ETB</b>\nReference: <code>TX-88-4471</code>\n\n<i>Abebe Pharmacy</i>');
    expect(toPlainText(receipt)).toBe('✅ Payment received\n\nAmount: 1,250 ETB\nReference: TX-88-4471\n\nAbebe Pharmacy');
  });

  it('shows values literally and supports a custom emoji or none', () => {
    const html = toTelegramHtml(renderLayout({ type: 'alert', emoji: '', title: '**Not** <bold>', rows: [{ label: 'Card_no', value: '*1234*' }] }));
    expect(html).toBe('<b>**Not** &lt;bold&gt;</b>\n\nCard_no: <b>*1234*</b>');
  });
});

describe('portal copy', () => {
  it('is identical to the portal preview module', () => {
    const api = readFileSync(join(__dirname, 'rich-text.ts'), 'utf8');
    const portal = readFileSync(join(__dirname, '../../portal/src/lib/rich-text.ts'), 'utf8');
    expect(portal).toBe(api);
  });
});
