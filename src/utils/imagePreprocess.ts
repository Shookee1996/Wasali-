/**
 * Client-side image validation and preprocessing utilities to maximize OCR accuracy
 * and gracefully handle edge cases (empty files, bad types, oversized images, corrupted pixels).
 */

export const SUPPORTED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

export const MAX_RAW_FILE_BYTES = 12 * 1024 * 1024; // 12 MB pre-compression cap
export const MAX_TARGET_DIMENSION = 2048;

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
}

export interface PreparedImagePayload {
  base64: string;
  mimeType: string;
  width: number;
  height: number;
  enhanced: boolean;
}

export function validateImageFileMetadata(file: {
  size: number;
  type: string;
  name?: string;
}): ImageValidationResult {
  if (!file || file.size === 0) {
    return { valid: false, error: 'الملف المحدد فارغ أو تالف.' };
  }

  if (file.size > MAX_RAW_FILE_BYTES) {
    return {
      valid: false,
      error: 'حجم الصورة كبير جداً (الحد الأقصى 12 ميجابايت قبل الضغط).',
    };
  }

  const mime = (file.type || '').toLowerCase();
  if (!SUPPORTED_IMAGE_TYPES.has(mime)) {
    return {
      valid: false,
      error: 'يرجى اختيار صورة بصيغة مدعومة (PNG أو JPG أو WebP).',
    };
  }

  return { valid: true };
}

/**
 * Loads an image File in the browser, downscales oversized dimensions cleanly,
 * optionally applies contrast + grayscale enhancement for crisper Arabic text recognition,
 * and returns a clean base64 payload ready for /api/ocr.
 */
export async function preprocessImageForOcr(
  file: File,
  enhanceContrast: boolean = true
): Promise<PreparedImagePayload> {
  const check = validateImageFileMetadata(file);
  if (!check.valid) {
    throw new Error(check.error);
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('تعذر قراءة الصورة. قد يكون الملف تالفاً.'));
      el.src = objectUrl;
    });

    const srcWidth = img.naturalWidth || img.width;
    const srcHeight = img.naturalHeight || img.height;

    if (srcWidth < 8 || srcHeight < 8) {
      throw new Error('أبعاد الصورة صغيرة جداً ولا يمكن استخراج نص منها.');
    }

    const scale = Math.min(1, MAX_TARGET_DIMENSION / Math.max(srcWidth, srcHeight));
    const targetWidth = Math.max(1, Math.round(srcWidth * scale));
    const targetHeight = Math.max(1, Math.round(srcHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('تعذر تهيئة معالج الصور في المتصفح.');
    }

    // White background prevents transparent PNGs from turning black when encoded as JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    if (enhanceContrast) {
      // Subtle contrast boost & slight grayscale helps Arabic diacritics and faint ink stand out
      ctx.filter = 'contrast(1.18) brightness(1.03)';
    }

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const outputMime = file.type === 'image/png' && !enhanceContrast ? 'image/png' : 'image/jpeg';
    const dataUrl = canvas.toDataURL(outputMime, 0.92);
    const base64 = dataUrl.split(',')[1] || '';

    if (!base64) {
      throw new Error('فشل ترميز الصورة قبل الإرسال.');
    }

    return {
      base64,
      mimeType: outputMime,
      width: targetWidth,
      height: targetHeight,
      enhanced: enhanceContrast,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
