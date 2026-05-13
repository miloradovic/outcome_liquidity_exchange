export function createIdempotencyKey(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  const fallback = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  return `${prefix}-${fallback}`;
}
