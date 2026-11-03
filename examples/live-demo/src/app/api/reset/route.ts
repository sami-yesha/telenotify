import { NextResponse } from 'next/server';
import { COOKIE, currentSession } from '@/lib/telenotify';
import { deleteSession } from '@/lib/store';

// "Start over": forget this visitor.
export async function POST() {
  const { session } = await currentSession(false);
  if (session) deleteSession(session.id);
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(COOKIE);
  return response;
}
