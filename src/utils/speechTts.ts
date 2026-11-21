/**
 * Pure utilities for Arabic Text-to-Speech (Web Speech API):
 * - Voice filtering & ranking for Arabic locales
 * - Sentence- and word-aware text chunking to prevent browser cutoff on long passages
 * - Speech rate clamping & whitespace cleanup while preserving diacritics for accurate pronunciation
 */

export interface SpeechVoiceLike {
  voiceURI: string;
  name: string;
  lang: string;
  localService?: boolean;
  default?: boolean;
}

const PREFERRED_ARABIC_LANG_ORDER = [
  'ar-sa',
  'ar-eg',
  'ar-ae',
  'ar-jo',
  'ar-lb',
  'ar-kw',
  'ar-qa',
  'ar-ma',
  'ar-dz',
  'ar-tn',
  'ar',
];

export const DEFAULT_SPEECH_RATE = 0.95;

export const SPEECH_RATE_OPTIONS: { value: number; label: string }[] = [
  { value: 0.75, label: 'بطيء (0.75×)' },
  { value: 0.95, label: 'طبيعي (0.95×)' },
  { value: 1.2, label: 'سريع (1.2×)' },
];

/**
 * Clamps playback speed into a natural, intelligible range for Arabic TTS.
 */
export function clampSpeechRate(rate: number): number {
  if (!Number.isFinite(rate)) return DEFAULT_SPEECH_RATE;
  return Math.min(1.5, Math.max(0.6, Math.round(rate * 100) / 100));
}

/**
 * Normalizes whitespace for speech synthesis while preserving Arabic diacritics (Tashkeel)
 * so modern Arabic TTS voices articulate word endings and shadda accurately.
 */
export function prepareTextForSpeech(text: string): string {
  if (!text) return '';
  return text
    .replace(/\u0640+/g, '') // Remove Kashida/Tatweel elongations which can confuse TTS engines
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n+[ \t]*/g, '\n')
    .trim();
}

/**
 * Splits long Arabic passages into manageable chunks (~180 chars max) at sentence or word boundaries
 * so Chrome/Android Web Speech API engines do not truncate or stall mid-passage.
 */
export function splitTextIntoSpeechChunks(text: string, maxChars = 180): string[] {
  const prepared = prepareTextForSpeech(text);
  if (!prepared) return [];
  if (prepared.length <= maxChars) return [prepared];

  // Split by sentence/clause terminators while keeping punctuation attached for natural intonation
  const segments = prepared
    .split(/(?<=[.،؛؟!\n])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  const flushCurrent = () => {
    if (current.trim()) {
      chunks.push(current.trim());
      current = '';
    }
  };

  for (const segment of segments) {
    if (segment.length <= maxChars) {
      const candidate = current ? `${current} ${segment}` : segment;
      if (candidate.length <= maxChars) {
        current = candidate;
      } else {
        flushCurrent();
        current = segment;
      }
      continue;
    }

    // Segment exceeds maxChars: split cleanly along word boundaries
    flushCurrent();
    const words = segment.split(/\s+/).filter(Boolean);
    for (const word of words) {
      if (word.length > maxChars) {
        flushCurrent();
        for (let i = 0; i < word.length; i += maxChars) {
          chunks.push(word.slice(i, i + maxChars));
        }
        continue;
      }
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxChars) {
        current = candidate;
      } else {
        flushCurrent();
        current = word;
      }
    }
    flushCurrent();
  }

  flushCurrent();
  return chunks;
}

/**
 * Filters a list of browser SpeechSynthesis voices down to Arabic voices.
 */
export function filterArabicVoices<T extends SpeechVoiceLike>(voices: readonly T[]): T[] {
  return voices.filter((v) => v.lang.toLowerCase().startsWith('ar'));
}

/**
 * Selects the highest-priority Arabic voice, honoring an explicit user choice if still present.
 */
export function selectBestArabicVoice<T extends SpeechVoiceLike>(
  voices: readonly T[],
  preferredVoiceURI?: string
): T | null {
  if (preferredVoiceURI) {
    const exactMatch = voices.find((v) => v.voiceURI === preferredVoiceURI);
    if (exactMatch) return exactMatch;
  }

  const arabicVoices = filterArabicVoices(voices);
  if (arabicVoices.length === 0) return null;

  const scoreVoice = (voice: T): number => {
    const lang = voice.lang.toLowerCase();
    const langIdx = PREFERRED_ARABIC_LANG_ORDER.indexOf(lang);
    const langScore = langIdx !== -1 ? 200 - langIdx * 15 : 20;
    const localBonus = voice.localService ? 8 : 0;
    const defaultBonus = voice.default ? 4 : 0;
    const nameBonus = /natural|neural|google|maged|tarik|laila|hoda|naayf/i.test(voice.name)
      ? 6
      : 0;
    return langScore + localBonus + defaultBonus + nameBonus;
  };

  return [...arabicVoices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
}
