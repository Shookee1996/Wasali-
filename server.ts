import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  OcrServiceError,
  validateOcrPayload,
  extractTextFromImage,
} from './src/server/ocrService.ts';
import { RateLimiter, isSensitivePath } from './src/server/rateLimiter.ts';

const apiGlobalLimiter = new RateLimiter({
  windowMs: 60_000,
  maxRequests: 60,
  lockoutMs: 5 * 60_000,
  lockoutThreshold: 5,
});

const ocrStrictLimiter = new RateLimiter({
  windowMs: 15 * 60_000,
  maxRequests: 15,
  lockoutMs: 10 * 60_000,
  lockoutThreshold: 3,
});

function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function applyRateLimit(limiter: RateLimiter) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = limiter.consume(getClientIp(req));
    res.setHeader('X-RateLimit-Limit', String(result.limit));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      res.status(429).json({
        error: result.lockedOut
          ? 'تم حظر الطلبات مؤقتاً بسبب تكرار المحاولات. يرجى الانتظار والمحاولة لاحقاً.'
          : 'تم تجاوز الحد المسموح من الطلبات. يرجى الانتظار قليلاً.',
        code: result.lockedOut ? 'IP_LOCKED_OUT' : 'RATE_LIMIT_EXCEEDED',
      });
      return;
    }

    next();
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // Disable framework fingerprinting and trust first proxy hop
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Baseline HTTP security headers
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // Never expose .env, .git, backups, DB files, or server configs over HTTP
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (isSensitivePath(req.path, { allowViteDevDeps: !isProd })) {
      res.status(404).send('Not Found');
      return;
    }
    next();
  });

  app.use(express.json({ limit: '8mb' }));

  // Apply global API rate limiting
  app.use('/api', applyRateLimit(apiGlobalLimiter));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/ocr', applyRateLimit(ocrStrictLimiter), async (req: Request, res: Response) => {
    try {
      if (!req.is('application/json')) {
        res.status(415).json({
          error: 'نوع المحتوى غير مدعوم.',
          code: 'UNSUPPORTED_MEDIA_TYPE',
        });
        return;
      }

      const validated = validateOcrPayload(req.body);
      const result = await extractTextFromImage(validated);
      res.json(result);
    } catch (err) {
      if (err instanceof OcrServiceError) {
        res.status(err.statusCode).json({
          error: err.message,
          code: err.code,
        });
        return;
      }
      res.status(500).json({
        error: 'تعذر إتمام الطلب حالياً. يرجى المحاولة لاحقاً.',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(
      express.static(distPath, {
        dotfiles: 'deny',
        etag: true,
      })
    );
    app.get('*', (_req: Request, res: Response) => {
      const indexHtml = path.join(distPath, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Not Found');
      }
    });
  }

  // Catch-all Express error handler: never expose stack traces or raw JSON parse/internal errors
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const status =
      typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status: unknown }).status === 'number'
        ? (err as { status: number }).status
        : 500;

    if (req.path.startsWith('/api')) {
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: status === 400 ? 'صيغة الطلب غير صالحة.' : 'حدث خطأ غير متوقع في الخادم.',
        code: status === 400 ? 'BAD_REQUEST' : 'INTERNAL_ERROR',
      });
      return;
    }

    res.status(status >= 400 && status < 600 ? status : 500).send('حدث خطأ غير متوقع.');
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Mishkal server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(() => {
  console.error('Failed to start server.');
  process.exit(1);
});
