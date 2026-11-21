import { GoogleGenAI, GenerateContentResponse, ThinkingLevel } from '@google/genai';

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6 MB decoded limit

export interface OcrRequestPayload {
  imageBase64?: unknown;
  mimeType?: unknown;
  preserveDiacritics?: unknown;
}

export interface ValidatedOcrInput {
  base64Data: string;
  mimeType: string;
  preserveDiacritics: boolean;
}

export class OcrServiceError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = 'OcrServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Validates and normalizes incoming OCR payload data, handling data URL prefixes,
 * unsupported MIME types, empty data, and oversized payloads.
 */
export function validateOcrPayload(payload: OcrRequestPayload): ValidatedOcrInput {
  if (!payload || typeof payload !== 'object') {
    throw new OcrServiceError('بيانات الطلب غير صالحة.', 400, 'INVALID_PAYLOAD');
  }

  const rawMime = typeof payload.mimeType === 'string' ? payload.mimeType.trim().toLowerCase() : '';
  const normalizedMime = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;

  if (!ALLOWED_IMAGE_MIME_TYPES.has(rawMime)) {
    throw new OcrServiceError(
      'صيغة الصورة غير مدعومة. الصيغ المدعومة: PNG، JPEG، WebP، GIF.',
      400,
      'UNSUPPORTED_MIME_TYPE'
    );
  }

  if (typeof payload.imageBase64 !== 'string' || !payload.imageBase64.trim()) {
    throw new OcrServiceError('لم يتم إرسال بيانات الصورة.', 400, 'EMPTY_IMAGE');
  }

  // Strip optional data URI prefix if present
  let base64Data = payload.imageBase64.trim();
  const dataUriPrefix = /^data:image\/[a-zA-Z0-9.+-]+;base64,/i;
  if (dataUriPrefix.test(base64Data)) {
    base64Data = base64Data.replace(dataUriPrefix, '');
  }

  // Validate base64 characters cleanly
  const cleanedBase64 = base64Data.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+=*$/.test(cleanedBase64) || cleanedBase64.length < 16) {
    throw new OcrServiceError('بيانات الصورة المشفرة غير صالحة أو تالفة.', 400, 'INVALID_BASE64');
  }

  // Check decoded byte size
  const padding = cleanedBase64.endsWith('==') ? 2 : cleanedBase64.endsWith('=') ? 1 : 0;
  const approxBytes = Math.floor((cleanedBase64.length * 3) / 4) - padding;
  if (approxBytes <= 0 || approxBytes > MAX_IMAGE_BYTES) {
    throw new OcrServiceError(
      'حجم الصورة يتجاوز الحد الأقصى المسموح به (6 ميجابايت).',
      413,
      'IMAGE_TOO_LARGE'
    );
  }

  // Server-side binary magic-byte signature verification (prevents spoofed MIME types)
  const buffer = Buffer.from(cleanedBase64, 'base64');
  if (!hasValidImageMagicBytes(buffer, normalizedMime)) {
    throw new OcrServiceError(
      'محتوى الملف لا يطابق صيغة صورة صالحة.',
      400,
      'INVALID_IMAGE_SIGNATURE'
    );
  }

  return {
    base64Data: cleanedBase64,
    mimeType: normalizedMime,
    preserveDiacritics: payload.preserveDiacritics !== false,
  };
}

/**
 * Verifies the actual binary header bytes of a decoded buffer match the declared image MIME type.
 */
export function hasValidImageMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 12) return false;

  switch (mimeType) {
    case 'image/png':
      // 89 50 4E 47 0D 0A 1A 0A
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
      );
    case 'image/jpeg':
      // FF D8 FF
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case 'image/gif':
      // GIF87a or GIF89a
      return (
        buffer[0] === 0x47 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x38 &&
        (buffer[4] === 0x37 || buffer[4] === 0x39) &&
        buffer[5] === 0x61
      );
    case 'image/webp':
      // RIFF....WEBP
      return (
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46 &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
      );
    default:
      return false;
  }
}

/**
 * Post-processes OCR model output to remove markdown fences or extraneous wrapper quotes.
 */
export function cleanExtractedOcrText(rawText: string | undefined): string {
  if (!rawText) return '';
  let text = rawText.trim();

  // Strip markdown code blocks if returned accidentally
  text = text.replace(/^```(?:text|arabic|markdown|txt)?\s*\n?/i, '').replace(/\n?```$/i, '').trim();

  if (!text || text === '[NO_TEXT_FOUND]' || text === 'NO_TEXT_FOUND') {
    return '';
  }
  return text;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes('503') ||
    message.includes('500') ||
    message.includes('UNAVAILABLE') ||
    message.includes('ETIMEDOUT') ||
    message.includes('ECONNRESET')
  );
}

/**
 * Extracts Arabic and multilingual text from an image using Gemini Vision API with
 * accuracy-focused instructions and exponential backoff retries.
 */
export async function extractTextFromImage(
  input: ValidatedOcrInput,
  apiKey: string | undefined = process.env.GEMINI_API_KEY
): Promise<{ text: string }> {
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new OcrServiceError(
      'مفتاح خدمة استخراج النصوص غير مضبوط في إعدادات الخادم (Settings > Secrets).',
      503,
      'API_KEY_MISSING'
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const systemInstruction = [
    'أنت محرك دقيق جداً لاستخراج النصوص من الصور (OCR) مع تخصص متقدم في اللغة العربية.',
    'مهمتك استخراج جميع النصوص الظاهرة في الصورة بدقة تامة دون إضافة أي شرح أو مقدمات أو تعليقات.',
    'قواعد الاستخراج:',
    '1. حافظ على ترتيب القراءة الطبيعي (من اليمين إلى اليسار للعربية) وتنسيق الفقرات والأسطر.',
    input.preserveDiacritics
      ? '2. إذا كانت الصورة تحتوي على علامات تشكيل (فتحة، ضمة، كسرة، شدة، تنوين، سكون) فاحرص على نقلها بدقة.'
      : '2. استخرج الحروف الأساسية بوضوح مع تجاهل التشويش البصري.',
    '3. حافظ على علامات الترقيم والأرقام كما تظهر في الصورة.',
    '4. لا تُصحّح الأخطاء الإملائية من تلقاء نفسك ولا تُؤلّف كلمات غير موجودة.',
    '5. إذا لم يكن في الصورة أي نص واضح مقروء، أعد النص التالي فقط: [NO_TEXT_FOUND]',
  ].join('\n');

  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: input.mimeType,
                data: input.base64Data,
              },
            },
            {
              text: 'استخرج النص الكامل الموجود في هذه الصورة بدقة كما هو ظاهر.',
            },
          ],
        },
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const extracted = cleanExtractedOcrText(response.text);
      if (!extracted) {
        throw new OcrServiceError(
          'لم يُعثر على نص مقروء واضح داخل الصورة. جرّب صورة أوضح أو إضاءة أفضل.',
          422,
          'NO_TEXT_FOUND'
        );
      }

      return { text: extracted };
    } catch (err) {
      lastError = err;
      if (err instanceof OcrServiceError) {
        throw err;
      }

      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED') || msg.includes('403')) {
        throw new OcrServiceError(
          'تعذر المصادقة مع خدمة استخراج النصوص. يرجى التحقق من مفتاح API في الإعدادات.',
          403,
          'API_AUTH_ERROR'
        );
      }
      if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
        if (attempt < maxAttempts) {
          await sleep(500 * Math.pow(2, attempt - 1));
          continue;
        }
        throw new OcrServiceError(
          'تم تجاوز حد الطلبات المؤقت لخدمة الاستخراج. يرجى المحاولة بعد قليل.',
          429,
          'RATE_LIMITED'
        );
      }

      if (isTransientError(err) && attempt < maxAttempts) {
        await sleep(400 * Math.pow(2, attempt - 1));
        continue;
      }

      break;
    }
  }

  // Never expose raw upstream SDK messages or stack details to the client
  if (process.env.NODE_ENV !== 'production' && lastError) {
    console.error('[OCR internal error]', lastError instanceof Error ? lastError.name : 'UnknownError');
  }

  throw new OcrServiceError(
    'تعذر تحليل الصورة حالياً. يرجى المحاولة مرة أخرى لاحقاً.',
    500,
    'OCR_FAILED'
  );
}
