import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImageFileMetadata, MAX_RAW_FILE_BYTES } from './imagePreprocess';

test('validateImageFileMetadata accepts supported non-empty images under size cap', () => {
  assert.deepEqual(validateImageFileMetadata({ size: 2048, type: 'image/png' }), { valid: true });
  assert.deepEqual(validateImageFileMetadata({ size: 1024, type: 'image/jpeg' }), { valid: true });
  assert.deepEqual(validateImageFileMetadata({ size: 512, type: 'image/webp' }), { valid: true });
});

test('validateImageFileMetadata rejects empty, oversized, and non-image files', () => {
  const empty = validateImageFileMetadata({ size: 0, type: 'image/png' });
  assert.equal(empty.valid, false);

  const oversized = validateImageFileMetadata({ size: MAX_RAW_FILE_BYTES + 1, type: 'image/jpeg' });
  assert.equal(oversized.valid, false);

  const badMime = validateImageFileMetadata({ size: 1024, type: 'application/pdf' });
  assert.equal(badMime.valid, false);
});
