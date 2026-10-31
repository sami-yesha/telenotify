import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';

export const DEFAULT_API_URL = 'https://telenotify-api.duckdns.org';

export interface Settings {
  apiKey?: string;
  apiUrl?: string;
}

/** ~/.config/telenotify/config.json (or $XDG_CONFIG_HOME, or TELENOTIFY_CONFIG for tests). */
export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.TELENOTIFY_CONFIG) return env.TELENOTIFY_CONFIG;
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'telenotify', 'config.json');
}

export function readSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  const path = configPath(env);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Settings;
  } catch {
    return {};
  }
}

// The key is a secret: the file is readable by this user only.
export function saveSettings(settings: Settings, env: NodeJS.ProcessEnv = process.env): string {
  const path = configPath(env);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

export function clearSettings(env: NodeJS.ProcessEnv = process.env): boolean {
  const path = configPath(env);
  if (!existsSync(path)) return false;
  rmSync(path);
  return true;
}

/** Flag, then environment variable, then the saved login. */
export function resolve(flags: { key?: string; apiUrl?: string }, env: NodeJS.ProcessEnv = process.env): { apiKey?: string; apiUrl: string } {
  const saved = readSettings(env);
  return {
    apiKey: flags.key || env.TELENOTIFY_API_KEY || saved.apiKey,
    apiUrl: (flags.apiUrl || env.TELENOTIFY_API_URL || saved.apiUrl || DEFAULT_API_URL).replace(/\/$/, ''),
  };
}
