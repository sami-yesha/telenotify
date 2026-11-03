import type { InlineButton, Layout, Locale } from '@telenotify/node';

export const LOCALES: { id: Locale; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'am', label: 'አማርኛ' },
  { id: 'om', label: 'Afaan Oromoo' },
  { id: 'ti', label: 'ትግርኛ' },
];

export type SampleKind = 'receipt' | 'delivery' | 'login';

export const SAMPLES: { id: SampleKind; label: string; hint: string }[] = [
  { id: 'receipt', label: 'Payment receipt', hint: 'A transaction alert with tap-to-copy reference' },
  { id: 'delivery', label: 'Delivery update', hint: 'An order status update' },
  { id: 'login', label: 'Login alert', hint: 'A security alert with a button, sent as high priority' },
];

interface Text {
  title: string;
  body: string;
  rows: [string, string][];
  button?: string;
  footer: string;
}

// The same three messages in English, Amharic, Afaan Oromo and Tigrinya.
const TEXT: Record<SampleKind, Record<Locale, Text>> = {
  receipt: {
    en: { title: 'Payment received', body: 'You received **1,250.00 ETB**.', rows: [['Amount', '1,250.00 ETB'], ['From', 'Abebe Kebede'], ['Reference', 'TXN-48213']], footer: 'Telenotify live demo' },
    am: { title: 'ክፍያ ደርሷል', body: '**1,250.00 ብር** ተቀብለዋል።', rows: [['መጠን', '1,250.00 ብር'], ['ላኪ', 'አበበ ከበደ'], ['መለያ ቁጥር', 'TXN-48213']], footer: 'Telenotify የቀጥታ ማሳያ' },
    om: { title: 'Kaffaltii argattan', body: 'Qarshii **1,250.00** argattaniittu.', rows: [['Hanga', 'Qarshii 1,250.00'], ['Kan erge', 'Abbabaa Kabbadaa'], ['Lakkoofsa ragaa', 'TXN-48213']], footer: 'Agarsiisa kallattii Telenotify' },
    ti: { title: 'ክፍሊት በጺሑኩም', body: '**1,250.00 ብር** ተቐቢልኩም።', rows: [['መጠን', '1,250.00 ብር'], ['ሰዳዲ', 'ኣበበ ከበደ'], ['መወከሲ ቁጽሪ', 'TXN-48213']], footer: 'Telenotify ቀጥታዊ ምርኢት' },
  },
  delivery: {
    en: { title: 'Your order is on its way', body: 'Order #4821 has left the store and will arrive today.', rows: [['Order', '#4821'], ['Arrives', 'Today']], footer: 'Telenotify live demo' },
    am: { title: 'ትዕዛዝዎ በመንገድ ላይ ነው', body: 'ትዕዛዝ #4821 ከመደብሩ ወጥቷል፤ ዛሬ ይደርሳል።', rows: [['ትዕዛዝ', '#4821'], ['የሚደርሰው', 'ዛሬ']], footer: 'Telenotify የቀጥታ ማሳያ' },
    om: { title: 'Ajajni keessan karaa irra jira', body: 'Ajajni #4821 suuqii irraa ba\'eera, har\'a isin bira ga\'a.', rows: [['Ajaja', '#4821'], ['Yeroo ga\'u', 'Har\'a']], footer: 'Agarsiisa kallattii Telenotify' },
    ti: { title: 'ትእዛዝኩም ኣብ መገዲ እዩ', body: 'ትእዛዝ #4821 ካብ ድኳን ወጺኡ ኣሎ፤ ሎሚ ክበጽሕ እዩ።', rows: [['ትእዛዝ', '#4821'], ['ዝበጽሓሉ', 'ሎሚ']], footer: 'Telenotify ቀጥታዊ ምርኢት' },
  },
  login: {
    en: { title: 'New sign-in to your account', body: 'Someone signed in with Chrome on Windows in Addis Ababa. If this was you, you can ignore this message.', rows: [], button: 'This wasn\'t me', footer: 'Telenotify live demo' },
    am: { title: 'ወደ መለያዎ አዲስ መግቢያ', body: 'አንድ ሰው በአዲስ አበባ በWindows ላይ በChrome ገብቷል። እርስዎ ከሆኑ ይህን መልእክት መተው ይችላሉ።', rows: [], button: 'እኔ አይደለሁም', footer: 'Telenotify የቀጥታ ማሳያ' },
    om: { title: 'Seensa haaraa herrega keessanitti', body: 'Namni tokko Finfinneetti Chrome Windows irratti fayyadamee seeneera. Isin yoo taatan, ergaa kana dhiisuu dandeessu.', rows: [], button: 'Ana miti', footer: 'Agarsiisa kallattii Telenotify' },
    ti: { title: 'ሓድሽ ምእታው ናብ ሕሳብኩም', body: 'ሓደ ሰብ ኣብ ኣዲስ ኣበባ ብChrome ኣብ Windows ኣትዩ። ንስኹም እንተኾንኩም ነዚ መልእክቲ ክትሓድግዎ ትኽእሉ ኢኹም።', rows: [], button: 'ኣነ ኣይኮንኩን', footer: 'Telenotify ቀጥታዊ ምርኢት' },
  },
};

const LAYOUT_TYPE: Record<SampleKind, Layout['type']> = { receipt: 'receipt', delivery: 'status', login: 'alert' };

export function buildMessage(kind: SampleKind, locale: Locale, publicUrl: string): { layout: Layout; buttons?: InlineButton[][]; priority: 'normal' | 'high' } {
  const t = TEXT[kind][locale];
  const layout: Layout = {
    type: LAYOUT_TYPE[kind],
    title: t.title,
    body: t.body,
    rows: t.rows.map(([label, value]) => ({ label, value, copy: label === t.rows.at(-1)?.[0] && kind === 'receipt' })),
    footer: t.footer,
  };
  // Telegram only opens https buttons.
  const buttons = t.button && publicUrl.startsWith('https://') ? [[{ text: t.button, url: `${publicUrl}/?from=telegram` }]] : undefined;
  return { layout, buttons, priority: kind === 'login' ? 'high' : 'normal' };
}

/** The SMS a customer who isn't on Telegram would get. */
export function smsText(locale: Locale): string {
  const t = TEXT.receipt[locale];
  return `${t.title}: ${t.rows.map(([label, value]) => `${label} ${value}`).join(', ')}.`;
}

/** "251911223344" → "+251 911 223 344" */
export function formatPhone(phone: string): string {
  return phone.startsWith('251') && phone.length === 12 ? `+251 ${phone.slice(3, 6)} ${phone.slice(6, 9)} ${phone.slice(9)}` : `+${phone}`;
}

export const isLocale =(value: unknown): value is Locale => LOCALES.some((l) => l.id === value);
export const isSample = (value: unknown): value is SampleKind => SAMPLES.some((s) => s.id === value);
