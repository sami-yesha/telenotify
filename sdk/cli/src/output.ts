// Terminal colors, off when output isn't a terminal or NO_COLOR is set.
const enabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const wrap = (code: number) => (text: string) => (enabled ? `\u001b[${code}m${text}\u001b[0m` : text);

export const color = {
  bold: wrap(1),
  dim: wrap(2),
  red: wrap(31),
  green: wrap(32),
  yellow: wrap(33),
  cyan: wrap(36),
};
