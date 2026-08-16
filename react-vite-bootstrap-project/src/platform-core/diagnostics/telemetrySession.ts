const SESSION_KEY = 'gm.telemetry.sessionId';

export function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function readOrCreateSessionId(): string {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return createSessionId();
  }
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = createSessionId();
    window.localStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return createSessionId();
  }
}
