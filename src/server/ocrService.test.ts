import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OcrServiceError,
  validateOcrPayload,
  cleanExtractedOcrText,
  hasValidImageMagicBytes,
} from './ocrService';

const VALID_PNG_BASE64 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]).toString('base64');

const VALID_JPEG_BASE64 = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
  0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
]).toString('base64');

test('validateOcrPayload accepts valid base64 with PNG magic bytes and optional data URI prefix', () => {
  const validated = validateOcrPayload({
    imageBase64: `data:image/png;base64,${VALID_PNG_BASE64}`,
    mimeType: 'image/png',
    preserveDiacritics: true,
  });

  assert.equal(validated.mimeType, 'image/png');
  assert.equal(validated.base64Data, VALID_PNG_BASE64);
  assert.equal(validated.preserveDiacritics, true);
});

test('validateOcrPayload normalizes image/jpg to image/jpeg with valid JPEG header', () => {
  const validated = validateOcrPayload({
    imageBase64: VALID_JPEG_BASE64,
    mimeType: 'image/jpg',
  });
  assert.equal(validated.mimeType, 'image/jpeg');
});

test('validateOcrPayload rejects spoofed binary payloads, unsupported mimes, and malformed base64', () => {
  const fakePngBase64 = Buffer.from('<script>alert(1)</script>').toString('base64');
  assert.throws(
    () => validateOcrPayload({ imageBase64: fakePngBase64, mimeType: 'image/png' }),
    (err: unknown) => err instanceof OcrServiceError && err.code === 'INVALID_IMAGE_SIGNATURE'
  );

  assert.throws(
    () => validateOcrPayload({ imageBase64: VALID_PNG_BASE64, mimeType: 'application/pdf' }),
    (err: unknown) => err instanceof OcrServiceError && err.code === 'UNSUPPORTED_MIME_TYPE'
  );

  assert.throws(
    () => validateOcrPayload({ imageBase64: '   ', mimeType: 'image/png' }),
    (err: unknown) => err instanceof OcrServiceError && err.code === 'EMPTY_IMAGE'
  );

  assert.throws(
    () => validateOcrPayload({ imageBase64: 'not*valid*base64!', mimeType: 'image/png' }),
    (err: unknown) => err instanceof OcrServiceError && err.code === 'INVALID_BASE64'
  );
});

test('hasValidImageMagicBytes validates PNG, JPEG, GIF, and WebP signatures', () => {
  assert.equal(
    hasValidImageMagicBytes(Buffer.from('RIFF1234WEBP'), 'image/webp'),
    true
  );
  assert.equal(
    hasValidImageMagicBytes(Buffer.from('GIF89a123456'), 'image/gif'),
    true
  );
  assert.equal(
    hasValidImageMagicBytes(Buffer.from('plain-text-not-image'), 'image/jpeg'),
    false
  );
});

test('cleanExtractedOcrText strips markdown fences and detects NO_TEXT_FOUND sentinel', () => {
  assert.equal(
    cleanExtractedOcrText('```arabic\nبِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ\n```'),
    'بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ'
  );
  assert.equal(cleanExtractedOcrText('[NO_TEXT_FOUND]'), '');
  assert.equal(cleanExtractedOcrText('   '), '');
});
