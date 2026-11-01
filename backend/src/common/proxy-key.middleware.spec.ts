import { Request, Response } from 'express';
import { proxyKeyMiddleware } from './proxy-key.middleware';

const KEY = 'k'.repeat(40);

function run(key: string | undefined, path: string, header?: string) {
  const next = jest.fn();
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const req = { path, headers: header === undefined ? {} : { 'x-ims-proxy-key': header } } as unknown as Request;
  proxyKeyMiddleware(key)(req, res as unknown as Response, next);
  return { next, res };
}

describe('proxyKeyMiddleware', () => {
  it('lets everything through when no key is configured (development)', () => {
    expect(run(undefined, '/api/incidents').next).toHaveBeenCalled();
  });

  it('accepts requests carrying the right key', () => {
    expect(run(KEY, '/api/incidents', KEY).next).toHaveBeenCalled();
  });

  it('rejects a missing, wrong or wrong-length key with 403', () => {
    for (const header of [undefined, 'wrong', 'k'.repeat(39), 'x'.repeat(40)]) {
      const { next, res } = run(KEY, '/api/incidents', header);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    }
  });

  it('exempts only the health check', () => {
    expect(run(KEY, '/api/health').next).toHaveBeenCalled();
    expect(run(KEY, '/api/health/x').next).not.toHaveBeenCalled();
  });
});
