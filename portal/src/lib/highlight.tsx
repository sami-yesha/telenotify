import { Fragment, ReactNode } from 'react';

// A small regex highlighter for the languages in our code samples. It only has
// to look good on short, well-formed snippets, so it skips a real parser.

const KEYWORDS: Record<string, string[]> = {
  javascript: ['import', 'from', 'const', 'let', 'await', 'async', 'function', 'return', 'if', 'else', 'new', 'export', 'true', 'false', 'null', 'undefined'],
  python: ['import', 'from', 'def', 'return', 'if', 'else', 'elif', 'True', 'False', 'None', 'as', 'with', 'pass', 'async'],
  go: ['package', 'import', 'func', 'return', 'if', 'else', 'nil', 'defer', 'var', 'err'],
  php: ['echo', 'return', 'if', 'else', 'true', 'false', 'null', 'new'],
  java: ['import', 'var', 'new', 'return', 'if', 'else', 'true', 'false', 'null', 'public', 'class', 'static', 'void'],
  bash: ['curl'],
  json: ['true', 'false', 'null'],
};

const COMMENT: Record<string, string> = {
  javascript: '//[^\\n]*',
  go: '//[^\\n]*',
  java: '//[^\\n]*',
  php: '//[^\\n]*|#[^\\n]*',
  python: '#[^\\n]*',
  bash: '#[^\\n]*',
  json: '(?!x)x',
};

const CLASSES = {
  comment: 'text-slate-500 italic',
  string: 'text-emerald-300',
  keyword: 'text-pink-400',
  number: 'text-amber-300',
  fn: 'text-sky-300',
  flag: 'text-violet-300',
  key: 'text-sky-200',
  variable: 'text-orange-300',
};

export function highlight(code: string, language = 'bash'): ReactNode {
  const lang = language in KEYWORDS ? language : language === 'shell' ? 'bash' : 'javascript';
  const keywords = KEYWORDS[lang];
  const pattern = new RegExp(
    [
      `(?<comment>${COMMENT[lang]})`,
      `(?<string>"""[\\s\\S]*?"""|\`[^\`]*\`|"(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*')`,
      `(?<flag>(?<=\\s)--?[a-zA-Z][\\w-]*)`,
      `(?<variable>\\$[A-Za-z_]\\w*)`,
      `(?<number>\\b\\d+(?:\\.\\d+)?\\b)`,
      `(?<word>[A-Za-z_]\\w*)(?<call>\\s*\\()?`,
    ].join('|'),
    'g',
  );

  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const match of code.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) out.push(code.slice(last, start));
    const groups = match.groups ?? {};
    const text = match[0];
    let cls: string | undefined;
    if (groups.comment) cls = CLASSES.comment;
    else if (groups.string) {
      // JSON object keys read better in a different color than values.
      cls = lang === 'json' && /^\s*:/.test(code.slice(start + text.length)) ? CLASSES.key : CLASSES.string;
    } else if (groups.flag) cls = lang === 'bash' ? CLASSES.flag : undefined;
    else if (groups.variable) cls = lang === 'php' || lang === 'bash' ? CLASSES.variable : undefined;
    else if (groups.number) cls = CLASSES.number;
    else if (groups.word) {
      if (keywords.includes(groups.word)) cls = CLASSES.keyword;
      else if (groups.call) {
        out.push(
          <span key={i++} className={CLASSES.fn}>
            {groups.word}
          </span>,
          groups.call,
        );
        last = start + text.length;
        continue;
      }
    }
    out.push(
      cls ? (
        <span key={i++} className={cls}>
          {text}
        </span>
      ) : (
        <Fragment key={i++}>{text}</Fragment>
      ),
    );
    last = start + text.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}
