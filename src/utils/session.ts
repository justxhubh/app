import type { AuthSession } from '../types';

// Member session users are keyed as `u-<memberId>` in the mock backend.
export function memberIdFromSession(session: AuthSession | null): string | null {
  if (!session || session.user.role !== 'MEMBER') return null;
  const id = session.user.id;
  return id.startsWith('u-') ? id.slice(2) : id;
}
