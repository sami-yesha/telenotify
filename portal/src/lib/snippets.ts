// Generates the same API call in several languages for the docs and API reference.

export const LANGUAGES = [
  { id: 'curl', label: 'cURL', highlight: 'bash' },
  { id: 'node', label: 'Node.js', highlight: 'javascript' },
  { id: 'python', label: 'Python', highlight: 'python' },
  { id: 'go', label: 'Go', highlight: 'go' },
  { id: 'php', label: 'PHP', highlight: 'php' },
  { id: 'java', label: 'Java', highlight: 'java' },
] as const;

export type Lang = (typeof LANGUAGES)[number]['id'];
export type Samples = Partial<Record<Lang, string>>;

export interface ApiCall {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: Record<string, unknown>;
  /** Example response, shown as a comment after the call. */
  response?: string;
  /** Node.js SDK call (without the client setup), e.g. "await telenotify.messages.send({...})". */
  sdk?: string;
}

export function snippets(call: ApiCall, ctx: { baseUrl: string; apiKey: string }): Samples {
  return {
    curl: curl(call, ctx),
    node: node(call, ctx),
    python: python(call, ctx),
    go: go(call, ctx),
    php: php(call, ctx),
    java: java(call, ctx),
  };
}

const url = (call: ApiCall, ctx: { baseUrl: string }) => `${ctx.baseUrl.replace(/\/$/, '')}${call.path}`;
// Pretty JSON that keeps short objects and arrays on one line.
const json = (value: unknown, depth = 0): string => {
  const compact = JSON.stringify(value);
  if (value === null || typeof value !== 'object' || (depth > 0 && compact.length <= 64)) return compact.replace(/":/g, '": ').replace(/,"/g, ', "').replace(/\{"/g, '{ "').replace(/"\}/g, '" }');
  const pad = '  '.repeat(depth + 1);
  const end = '  '.repeat(depth);
  if (Array.isArray(value)) return `[\n${value.map((v) => pad + json(v, depth + 1)).join(',\n')}\n${end}]`;
  return `{\n${Object.entries(value).map(([k, v]) => `${pad}"${k}": ${json(v, depth + 1)}`).join(',\n')}\n${end}}`;
};
const indentLines = (text: string, pad: string) => text.split('\n').map((line, i) => (i === 0 ? line : pad + line)).join('\n');
const tail = (call: ApiCall, comment: string) => (call.response ? `\n\n${comment} → ${call.response}` : '');

function curl(call: ApiCall, ctx: { baseUrl: string; apiKey: string }) {
  const lines = [`curl -X ${call.method} ${url(call, ctx)}`, `  -H "x-api-key: ${ctx.apiKey}"`];
  if (call.body) {
    lines.push('  -H "content-type: application/json"');
    lines.push(`  -d '${json(call.body).replace(/\n/g, '\n  ')}'`);
  }
  // No response comment here: zsh, the macOS default, rejects a pasted # line.
  return lines.join(' \\\n');
}

function node(call: ApiCall, ctx: { baseUrl: string; apiKey: string }) {
  const setup = `import { Telenotify } from '@telenotify/node';\n\nconst telenotify = new Telenotify({\n  apiKey: process.env.TELENOTIFY_API_KEY, // ${ctx.apiKey}\n  baseUrl: '${ctx.baseUrl}',\n});\n\n`;
  if (call.sdk) return setup + call.sdk + tail(call, '//');
  const options = [`  method: '${call.method}',`, `  headers: { 'x-api-key': process.env.TELENOTIFY_API_KEY${call.body ? `, 'content-type': 'application/json'` : ''} },`];
  if (call.body) options.push(`  body: JSON.stringify(${indentLines(toJs(call.body), '  ')}),`);
  return `const res = await fetch('${url(call, ctx)}', {\n${options.join('\n')}\n});\nconst data = await res.json();` + tail(call, '//');
}

function python(call: ApiCall, ctx: { baseUrl: string; apiKey: string }) {
  const args = [`    "${url(call, ctx)}",`, `    headers={"x-api-key": os.environ["TELENOTIFY_API_KEY"]},  # ${ctx.apiKey}`];
  if (call.body) args.push(`    json=${indentLines(toPython(call.body), '    ')},`);
  args.push('    timeout=10,');
  return `import os\nimport requests\n\nres = requests.${call.method.toLowerCase()}(\n${args.join('\n')}\n)\ndata = res.json()` + tail(call, '#');
}

function go(call: ApiCall, ctx: { baseUrl: string; apiKey: string }) {
  const body = call.body ? `body := strings.NewReader(\`${json(call.body)}\`)\n` : '';
  const reader = call.body ? 'body' : 'nil';
  return (
    `package main\n\nimport (\n\t"fmt"\n\t"io"\n\t"net/http"\n\t"os"${call.body ? '\n\t"strings"' : ''}\n)\n\nfunc main() {\n` +
    indentLines(
      `${body}req, _ := http.NewRequest("${call.method}", "${url(call, ctx)}", ${reader})\n` +
        `req.Header.Set("x-api-key", os.Getenv("TELENOTIFY_API_KEY")) // ${ctx.apiKey}\n` +
        (call.body ? `req.Header.Set("content-type", "application/json")\n` : '') +
        `\nres, err := http.DefaultClient.Do(req)\nif err != nil {\n\tpanic(err)\n}\ndefer res.Body.Close()\n\ndata, _ := io.ReadAll(res.Body)\nfmt.Println(res.StatusCode, string(data))`,
      '\t',
    ).replace(/^/, '\t') +
    `\n}` +
    tail(call, '//')
  );
}

function php(call: ApiCall, ctx: { baseUrl: string; apiKey: string }) {
  const options = [
    `    CURLOPT_CUSTOMREQUEST => '${call.method}',`,
    `    CURLOPT_RETURNTRANSFER => true,`,
    `    CURLOPT_HTTPHEADER => [\n        'x-api-key: ' . getenv('TELENOTIFY_API_KEY'), // ${ctx.apiKey}${call.body ? `\n        'content-type: application/json',` : ''}\n    ],`,
  ];
  if (call.body) options.push(`    CURLOPT_POSTFIELDS => json_encode(${indentLines(toPhp(call.body), '    ')}),`);
  return `<?php\n$ch = curl_init('${url(call, ctx)}');\ncurl_setopt_array($ch, [\n${options.join('\n')}\n]);\n$data = json_decode(curl_exec($ch), true);` + tail(call, '//');
}

function java(call: ApiCall, ctx: { baseUrl: string; apiKey: string }) {
  const publisher = call.body ? `HttpRequest.BodyPublishers.ofString("""\n${indentLines(json(call.body), '            ').replace(/^/, '            ')}\n            """)` : 'HttpRequest.BodyPublishers.noBody()';
  return (
    `import java.net.URI;\nimport java.net.http.*;\n\nvar request = HttpRequest.newBuilder(URI.create("${url(call, ctx)}"))\n` +
    `    .header("x-api-key", System.getenv("TELENOTIFY_API_KEY")) // ${ctx.apiKey}\n` +
    (call.body ? `    .header("content-type", "application/json")\n` : '') +
    `    .method("${call.method}", ${publisher})\n    .build();\n\n` +
    `var response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());\nSystem.out.println(response.body());` +
    tail(call, '//')
  );
}

// ---------- value printers ----------

const IDENT = /^[A-Za-z_$][\w$]*$/;

export function toJs(value: unknown, depth = 0): string {
  const pad = '  '.repeat(depth + 1);
  const end = '  '.repeat(depth);
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v !== 'object' || v === null)) return `[${value.map((v) => toJs(v)).join(', ')}]`;
    return `[\n${value.map((v) => pad + toJs(v, depth + 1)).join(',\n')},\n${end}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const inline = entries.every(([, v]) => typeof v !== 'object' || v === null) && entries.length <= 3;
    const parts = entries.map(([k, v]) => `${IDENT.test(k) ? k : `'${k}'`}: ${toJs(v, depth + 1)}`);
    if (inline && parts.join(', ').length < 60 && depth > 0) return `{ ${parts.join(', ')} }`;
    return `{\n${parts.map((p) => pad + p).join(',\n')},\n${end}}`;
  }
  return typeof value === 'string' ? `'${value.replace(/'/g, "\\'")}'` : String(value);
}

function toPython(value: unknown, depth = 0): string {
  const pad = '    '.repeat(depth + 1);
  const end = '    '.repeat(depth);
  if (Array.isArray(value)) return `[${value.map((v) => toPython(v, depth)).join(', ')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    const inline = entries.every(([, v]) => typeof v !== 'object' || v === null) && depth > 0;
    const parts = entries.map(([k, v]) => `"${k}": ${toPython(v, depth + 1)}`);
    if (inline) return `{${parts.join(', ')}}`;
    return `{\n${parts.map((p) => pad + p).join(',\n')},\n${end}}`;
  }
  if (value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

function toPhp(value: unknown, depth = 0): string {
  const pad = '    '.repeat(depth + 1);
  const end = '    '.repeat(depth);
  if (Array.isArray(value)) return `[${value.map((v) => toPhp(v, depth)).join(', ')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    const inline = entries.every(([, v]) => typeof v !== 'object' || v === null) && depth > 0;
    const parts = entries.map(([k, v]) => `'${k}' => ${toPhp(v, depth + 1)}`);
    if (inline) return `[${parts.join(', ')}]`;
    return `[\n${parts.map((p) => pad + p).join(',\n')},\n${end}]`;
  }
  if (value === null) return 'null';
  return typeof value === 'string' ? `'${value.replace(/'/g, "\\'")}'` : String(value);
}
