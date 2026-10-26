export type Theme = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'tn_theme';

// Telegram night (dark) is the default; "light" and "system" are opt-in.
// Runs in <head> before the page paints, so there's no flash of the wrong theme.
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');document.documentElement.setAttribute('data-theme',t==='light'||t==='system'?t:'dark')}catch(e){document.documentElement.setAttribute('data-theme','dark')}})();`;

export function readTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'system' ? value : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    if (theme === 'dark') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  window.dispatchEvent(new CustomEvent('tn-theme-change', { detail: theme }));
}
