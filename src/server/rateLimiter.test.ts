import test from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter, isSensitivePath } from './rateLimiter';

test('RateLimiter allows requests up to maxRequests and blocks excess within window', () => {
  const limiter = new RateLimiter({
    windowMs: 60_000,
    maxRequests: 3,
    lockoutMs: 120_000,
    lockoutThreshold: 2,
  });

  const t0 = 1_000_000;
  assert.equal(limiter.consume('1.2.3.4', t0).allowed, true);
  assert.equal(limiter.consume('1.2.3.4', t0 + 100).allowed, true);
  assert.equal(limiter.consume('1.2.3.4', t0 + 200).remaining, 0);

  // 4th request exceeds limit
  const blocked1 = limiter.consume('1.2.3.4', t0 + 300);
  assert.equal(blocked1.allowed, false);
  assert.equal(blocked1.lockedOut, false);

  // 5th request hits lockoutThreshold -> temporary lockout
  const blocked2 = limiter.consume('1.2.3.4', t0 + 400);
  assert.equal(blocked2.allowed, false);
  assert.equal(blocked2.lockedOut, true);
  assert.ok(blocked2.retryAfterSeconds >= 119);

  // Even after sliding window expires, lockout persists until lockoutMs passes
  assert.equal(limiter.consume('1.2.3.4', t0 + 70_000).allowed, false);
  assert.equal(limiter.consume('1.2.3.4', t0 + 125_000).allowed, true);
});

test('isSensitivePath blocks dotfiles, env files, backups, DB dumps, and server configs', () => {
  assert.equal(isSensitivePath('/.env'), true);
  assert.equal(isSensitivePath('/%2eenv'), true);
  assert.equal(isSensitivePath('/.env.production'), true);
  assert.equal(isSensitivePath('/.git/HEAD'), true);
  assert.equal(isSensitivePath('/../.env'), true);
  assert.equal(isSensitivePath('/backup.sql'), true);
  assert.equal(isSensitivePath('/app.db'), true);
  assert.equal(isSensitivePath('/config.bak'), true);
  assert.equal(isSensitivePath('/server.ts'), true);
  assert.equal(isSensitivePath('/src/server/ocrService.ts'), true);
  assert.equal(isSensitivePath('/package.json'), true);

  // Vite .vite dev bundles blocked in prod, allowed only when allowViteDevDeps is true
  assert.equal(isSensitivePath('/node_modules/.vite/deps/react-dom_client.js'), true);
  assert.equal(
    isSensitivePath('/node_modules/.vite/deps/react-dom_client.js', { allowViteDevDeps: true }),
    false
  );
  assert.equal(
    isSensitivePath('/node_modules/.vite/.env', { allowViteDevDeps: true }),
    true
  );

  // Normal app assets remain accessible
  assert.equal(isSensitivePath('/'), false);
  assert.equal(isSensitivePath('/src/main.tsx'), false);
  assert.equal(isSensitivePath('/api/ocr'), false);
  assert.equal(isSensitivePath('/.well-known/security.txt'), false);
});
