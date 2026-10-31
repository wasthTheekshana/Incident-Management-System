export interface Env {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  APP_URL: string;
  CORS_ORIGIN: string;
  COOKIE_SECURE: boolean;
  UPLOAD_DIR: string;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM: string;
}

const required = ['DATABASE_URL', 'REDIS_URL', 'APP_URL', 'CORS_ORIGIN', 'SMTP_HOST', 'SMTP_FROM'] as const;

/** Fails fast at boot: a misconfigured deployment must never start serving requests. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const missing = required.filter((k) => !raw[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  const nodeEnv = (raw.NODE_ENV as Env['NODE_ENV']) ?? 'development';
  const cookieSecure = raw.COOKIE_SECURE !== undefined ? raw.COOKIE_SECURE === 'true' : nodeEnv === 'production';
  if (nodeEnv === 'production' && !cookieSecure) {
    throw new Error('COOKIE_SECURE must be true in production (NFR-1: HTTPS only)');
  }
  return {
    NODE_ENV: nodeEnv,
    PORT: Number(raw.PORT ?? 3000),
    DATABASE_URL: String(raw.DATABASE_URL),
    REDIS_URL: String(raw.REDIS_URL),
    APP_URL: String(raw.APP_URL),
    CORS_ORIGIN: String(raw.CORS_ORIGIN),
    COOKIE_SECURE: cookieSecure,
    UPLOAD_DIR: String(raw.UPLOAD_DIR ?? './storage/uploads'),
    SMTP_HOST: String(raw.SMTP_HOST),
    SMTP_PORT: Number(raw.SMTP_PORT ?? 587),
    SMTP_USER: raw.SMTP_USER ? String(raw.SMTP_USER) : undefined,
    SMTP_PASS: raw.SMTP_PASS ? String(raw.SMTP_PASS) : undefined,
    SMTP_FROM: String(raw.SMTP_FROM),
  };
}
