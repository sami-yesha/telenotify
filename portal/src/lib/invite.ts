// localStorage key for an invitation opened before signing in.
export const PENDING_INVITE_KEY = 'tn_pending_invite';

export function rememberInvite(token: string) {
  try {
    localStorage.setItem(PENDING_INVITE_KEY, token);
  } catch {
    // Private mode: the person can reopen the link from the email.
  }
}

export function forgetInvite() {
  try {
    localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {}
}

// Read once: the /invite page saves it again only while the visitor is signed out,
// so an invitation for another email can't take over every later sign-in.
export function takePendingInvite(): string | null {
  try {
    const token = localStorage.getItem(PENDING_INVITE_KEY);
    localStorage.removeItem(PENDING_INVITE_KEY);
    return token;
  } catch {
    return null;
  }
}
