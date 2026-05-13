const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3001'];

export function parseAllowedOrigins(rawValue?: string): string[] {
  if (!rawValue) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  const origins = rawValue
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return origins.length > 0 ? origins : DEFAULT_ALLOWED_ORIGINS;
}