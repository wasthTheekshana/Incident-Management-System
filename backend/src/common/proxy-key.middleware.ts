import { timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export const PROXY_KEY_HEADER = 'x-ims-proxy-key';

/**
 * Production runs on a Docker network shared with other applications, so any container there could call the API
 * directly and forge X-Forwarded-For to dodge rate limits or falsify the audit log's IP. The shared Nginx adds a secret
 * header to every proxied request and the API refuses anything without it. The health check is exempt: it reveals only
 * "ok" and is called from inside the container.
 */
export function proxyKeyMiddleware(key: string | undefined) {
  const expected = key ? Buffer.from(key) : null;
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!expected || req.path === '/api/health') return next();
    const given = Buffer.from(String(req.headers[PROXY_KEY_HEADER] ?? ''));
    if (given.length === expected.length && timingSafeEqual(given, expected)) return next();
    res.status(403).json({ statusCode: 403, message: 'Forbidden' });
  };
}
