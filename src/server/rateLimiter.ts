/**
 * In-memory sliding-window Rate Limiter with temporary IP lockout for repeated abuse.
 * Protects API endpoints from brute-force, flooding, and quota exhaustion.
 */

export interface RateLimiterOptions {
  /** Time window in milliseconds (e.g., 60_000 for 1 minute) */
  windowMs: number;
  /** Maximum allowed requests per IP within `windowMs` */
  maxRequests: number;
  /** Temporary block duration in milliseconds when violations exceed `lockoutThreshold` */
  lockoutMs?: number;
  /** Number of consecutive blocked attempts before triggering temporary lockout */
  lockoutThreshold?: number;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAtMs: number;
  retryAfterSeconds: number;
  lockedOut: boolean;
}

interface ClientRecord {
  timestamps: number[];
  violations: number;
  lockedUntilMs: number;
}

export class RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly lockoutMs: number;
  private readonly lockoutThreshold: number;
  private readonly clients = new Map<string, ClientRecord>();

  constructor(options: RateLimiterOptions) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
    this.lockoutMs = options.lockoutMs ?? 5 * 60_000;
    this.lockoutThreshold = options.lockoutThreshold ?? 3;
  }

  /**
   * Checks and records a request for the given client key (usually IP address).
   */
  public consume(key: string, nowMs: number = Date.now()): RateLimitCheckResult {
    const normalizedKey = key || 'unknown';
    let record = this.clients.get(normalizedKey);
    if (!record) {
      record = { timestamps: [], violations: 0, lockedUntilMs: 0 };
      this.clients.set(normalizedKey, record);
    }

    // 1. Check active lockout
    if (record.lockedUntilMs > nowMs) {
      const retryAfterSeconds = Math.max(1, Math.ceil((record.lockedUntilMs - nowMs) / 1000));
      return {
        allowed: false,
        remaining: 0,
        limit: this.maxRequests,
        resetAtMs: record.lockedUntilMs,
        retryAfterSeconds,
        lockedOut: true,
      };
    }

    // Reset expired lockout
    if (record.lockedUntilMs > 0 && record.lockedUntilMs <= nowMs) {
      record.lockedUntilMs = 0;
      record.violations = 0;
    }

    // 2. Prune timestamps outside the sliding window
    const windowStart = nowMs - this.windowMs;
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    // 3. Enforce request limit
    if (record.timestamps.length >= this.maxRequests) {
      record.violations += 1;
      const oldestInWindow = record.timestamps[0] ?? nowMs;
      let resetAtMs = oldestInWindow + this.windowMs;

      if (record.violations >= this.lockoutThreshold) {
        record.lockedUntilMs = nowMs + this.lockoutMs;
        resetAtMs = record.lockedUntilMs;
      }

      const retryAfterSeconds = Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000));
      return {
        allowed: false,
        remaining: 0,
        limit: this.maxRequests,
        resetAtMs,
        retryAfterSeconds,
        lockedOut: record.lockedUntilMs > nowMs,
      };
    }

    // 4. Record allowed request
    record.timestamps.push(nowMs);
    record.violations = 0;
    const oldest = record.timestamps[0] ?? nowMs;

    // Periodic cleanup if map grows large
    if (this.clients.size > 5000) {
      this.pruneStale(nowMs);
    }

    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - record.timestamps.length),
      limit: this.maxRequests,
      resetAtMs: oldest + this.windowMs,
      retryAfterSeconds: 0,
      lockedOut: false,
    };
  }

  private pruneStale(nowMs: number): void {
    const cutoff = nowMs - Math.max(this.windowMs, this.lockoutMs);
    for (const [k, rec] of this.clients.entries()) {
      const latest = rec.timestamps[rec.timestamps.length - 1] ?? 0;
      if (latest < cutoff && rec.lockedUntilMs < nowMs) {
        this.clients.delete(k);
      }
    }
  }
}

export interface SensitivePathOptions {
  allowViteDevDeps?: boolean;
}

/**
 * Checks whether a requested URL path targets sensitive configuration, dotfiles, or backup files
 * that must never be exposed over HTTP.
 */
export function isSensitivePath(
  urlPath: string,
  options: SensitivePathOptions = {}
): boolean {
  let decodedPath = urlPath;
  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    // Reject malformed URL encodings
    return true;
  }

  const cleanPath = decodedPath.split('?')[0].replace(/\\/g, '/').toLowerCase();
  const segments = cleanPath.split('/').filter(Boolean);

  // Block path traversal attempts
  if (segments.includes('..')) {
    return true;
  }

  // Block hidden dotfiles like /.env, /.env.local, /.git/config, /.gitignore
  // Only allow Vite's internal /node_modules/.vite/ cache in non-production dev mode.
  const isViteDevBundle =
    Boolean(options.allowViteDevDeps) &&
    segments[0] === 'node_modules' &&
    segments[1] === '.vite';

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (!seg.startsWith('.') || seg === '.well-known') {
      continue;
    }
    if (isViteDevBundle && i === 1 && seg === '.vite') {
      continue;
    }
    return true;
  }

  // Block server-only directory and source files
  if (cleanPath === '/src/server' || cleanPath.startsWith('/src/server/')) {
    return true;
  }

  // Block server source / config / backup / DB dump extensions
  const blockedExtensions = [
    '.bak',
    '.backup',
    '.old',
    '.orig',
    '.sql',
    '.sqlite',
    '.sqlite3',
    '.db',
    '.pem',
    '.key',
    '.crt',
    '.log',
  ];
  if (blockedExtensions.some((ext) => cleanPath.endsWith(ext))) {
    return true;
  }

  const blockedExact = new Set([
    '/package.json',
    '/package-lock.json',
    '/bun.lock',
    '/tsconfig.json',
    '/vite.config.ts',
    '/server.ts',
    '/metadata.json',
  ]);
  return blockedExact.has(cleanPath);
}
