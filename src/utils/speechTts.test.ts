import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampSpeechRate,
  filterArabicVoices,
  prepareTextForSpeech,
  selectBestArabicVoice,
  splitTextIntoSpeechChunks,
  type SpeechVoiceLike,
} from './speechTts.ts';

test('prepareTextForSpeech removes tatweel and collapses spaces while preserving Arabic diacritics', () => {
  const input = '  اللُّغَةُ   الْعَـرَبِيَّةُ \n\n  جَمِيلَةٌ  ';
  const prepared = prepareTextForSpeech(input);
  assert.equal(prepared, 'اللُّغَةُ الْعَرَبِيَّةُ\nجَمِيلَةٌ');
  assert.match(prepared, /\u064E|\u064F|\u0651/);
});

test('splitTextIntoSpeechChunks preserves short sentences intact and splits long passages safely', () => {
  assert.deepEqual(splitTextIntoSpeechChunks('   '), []);
  assert.deepEqual(
    splitTextIntoSpeechChunks('بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ.', 180),
    ['بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ.']
  );

  const longText =
    'اللُّغَةُ الْعَرَبِيَّةُ بَحْرٌ وَاسِعٌ فِي الْبَيَانِ. تَتَمَيَّزُ بِدِقَّةِ اشْتِقَاقِهَا وَجَمَالِ تَرَاكِيبِهَا! هَلْ جَرَّبْتَ قِرَاءَةَ النُّصُوصِ الْمُشَكَّلَةِ؟ نَعَمْ، إِنَّ التَّشْكِيلَ يُوَضِّحُ الْمَعْنَى.';
  const chunks = splitTextIntoSpeechChunks(longText, 70);
  assert.ok(chunks.length >= 3);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 70, `Chunk exceeded maxChars: ${chunk.length}`);
  }
});

test('filterArabicVoices and selectBestArabicVoice prioritize Arabic locales and honor explicit selection', () => {
  const voices: SpeechVoiceLike[] = [
    { voiceURI: 'en-1', name: 'English US', lang: 'en-US', default: true },
    { voiceURI: 'ar-eg', name: 'Hoda', lang: 'ar-EG', localService: true },
    { voiceURI: 'ar-sa', name: 'Google العربية', lang: 'ar-SA', localService: false },
  ];

  const arOnly = filterArabicVoices(voices);
  assert.equal(arOnly.length, 2);

  const best = selectBestArabicVoice(voices);
  assert.equal(best?.voiceURI, 'ar-sa');

  const explicit = selectBestArabicVoice(voices, 'ar-eg');
  assert.equal(explicit?.voiceURI, 'ar-eg');

  assert.equal(selectBestArabicVoice([voices[0]]), null);
});

test('clampSpeechRate keeps rate within safe bounds and handles non-finite values', () => {
  assert.equal(clampSpeechRate(0.2), 0.6);
  assert.equal(clampSpeechRate(3.0), 1.5);
  assert.equal(clampSpeechRate(0.95), 0.95);
  assert.equal(clampSpeechRate(Number.NaN), 0.95);
});
