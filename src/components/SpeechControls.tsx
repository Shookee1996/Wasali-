import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Square, Volume2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  DEFAULT_SPEECH_RATE,
  SPEECH_RATE_OPTIONS,
  clampSpeechRate,
  filterArabicVoices,
  selectBestArabicVoice,
  splitTextIntoSpeechChunks,
} from '../utils/speechTts';

interface SpeechControlsProps {
  text: string;
}

type PlaybackStatus = 'idle' | 'speaking' | 'paused';

export function SpeechControls({ text }: SpeechControlsProps) {
  const isSupported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined';

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() =>
    isSupported ? window.speechSynthesis.getVoices() : []
  );
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [rate, setRate] = useState<number>(DEFAULT_SPEECH_RATE);
  const [status, setStatus] = useState<PlaybackStatus>('idle');
  const [chunkProgress, setChunkProgress] = useState<{ current: number; total: number } | null>(
    null
  );
  const [speechError, setSpeechError] = useState<string | null>(null);

  // Playback session token prevents stale utterance callbacks from advancing cancelled playback
  const sessionIdRef = useRef(0);
  const chunksRef = useRef<string[]>([]);

  // Subscribe to asynchronous browser voice loading
  useEffect(() => {
    if (!isSupported) return;
    const synth = window.speechSynthesis;
    const updateVoices = () => {
      setVoices(synth.getVoices());
    };
    updateVoices();
    synth.addEventListener?.('voiceschanged', updateVoices);
    return () => {
      synth.removeEventListener?.('voiceschanged', updateVoices);
    };
  }, [isSupported]);

  const arabicVoices = useMemo(() => filterArabicVoices(voices), [voices]);
  const activeVoice = useMemo(
    () => selectBestArabicVoice(voices, selectedVoiceURI || undefined),
    [voices, selectedVoiceURI]
  );

  const stopPlayback = useCallback(() => {
    sessionIdRef.current += 1;
    chunksRef.current = [];
    if (isSupported) {
      window.speechSynthesis.cancel();
    }
    setStatus((prev) => (prev === 'idle' ? prev : 'idle'));
    setChunkProgress((prev) => (prev === null ? prev : null));
  }, [isSupported]);

  // Stop active playback cleanly if formatted output changes or clears
  useEffect(() => {
    stopPlayback();
    setSpeechError((prev) => (prev === null ? prev : null));
  }, [text, stopPlayback]);

  // Ensure speech stops when component unmounts
  useEffect(() => {
    return () => {
      sessionIdRef.current += 1;
      if (isSupported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isSupported]);

  const speakChunkAt = useCallback(
    (index: number, sessionId: number, activeRate: number, voice: SpeechSynthesisVoice | null) => {
      if (!isSupported || sessionId !== sessionIdRef.current) return;
      const chunks = chunksRef.current;
      if (index >= chunks.length) {
        setStatus('idle');
        setChunkProgress(null);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      utterance.lang = voice?.lang || 'ar-SA';
      if (voice) {
        utterance.voice = voice;
      }
      utterance.rate = clampSpeechRate(activeRate);
      utterance.pitch = 1;

      setChunkProgress({ current: index + 1, total: chunks.length });

      utterance.onend = () => {
        if (sessionId !== sessionIdRef.current) return;
        speakChunkAt(index + 1, sessionId, activeRate, voice);
      };

      utterance.onerror = (event) => {
        if (sessionId !== sessionIdRef.current) return;
        // 'canceled' and 'interrupted' are expected when user stops or restarts playback
        if (event.error === 'canceled' || event.error === 'interrupted') {
          return;
        }
        setSpeechError('تعذّر تشغيل النطق الصوتي على هذا المتصفح. تأكد من تثبيت صوت عربي في إعدادات الجهاز.');
        setStatus('idle');
        setChunkProgress(null);
      };

      window.speechSynthesis.speak(utterance);
    },
    [isSupported]
  );

  const handlePlayOrTogglePause = () => {
    if (!isSupported || !text.trim()) return;
    setSpeechError(null);
    const synth = window.speechSynthesis;

    if (status === 'speaking') {
      synth.pause();
      setStatus('paused');
      return;
    }

    if (status === 'paused') {
      synth.resume();
      setStatus('speaking');
      return;
    }

    const chunks = splitTextIntoSpeechChunks(text, 180);
    if (chunks.length === 0) return;

    sessionIdRef.current += 1;
    const nextSession = sessionIdRef.current;
    chunksRef.current = chunks;
    synth.cancel();

    setStatus('speaking');
    speakChunkAt(0, nextSession, rate, activeVoice);
  };

  const handleRateChange = (nextRate: number) => {
    const clamped = clampSpeechRate(nextRate);
    setRate(clamped);
    // If currently active, restart cleanly with new rate from beginning
    if (status !== 'idle' && isSupported && text.trim()) {
      const chunks = splitTextIntoSpeechChunks(text, 180);
      if (chunks.length === 0) return;
      sessionIdRef.current += 1;
      const nextSession = sessionIdRef.current;
      chunksRef.current = chunks;
      window.speechSynthesis.cancel();
      setStatus('speaking');
      speakChunkAt(0, nextSession, clamped, activeVoice);
    }
  };

  const handleVoiceChange = (voiceURI: string) => {
    setSelectedVoiceURI(voiceURI);
    if (status !== 'idle' && isSupported && text.trim()) {
      const chosen = selectBestArabicVoice(voices, voiceURI || undefined);
      const chunks = splitTextIntoSpeechChunks(text, 180);
      if (chunks.length === 0) return;
      sessionIdRef.current += 1;
      const nextSession = sessionIdRef.current;
      chunksRef.current = chunks;
      window.speechSynthesis.cancel();
      setStatus('speaking');
      speakChunkAt(0, nextSession, rate, chosen);
    }
  };

  if (!isSupported) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 px-3.5 py-2.5 text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
        <Volume2 className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />
        <span>ميزة النطق الصوتي (Web Speech API) غير مدعومة في هذا المتصفح.</span>
      </div>
    );
  }

  return (
    <div
      aria-label="أدوات النطق الصوتي للنص المُشكَّل"
      className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3 space-y-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Play / Pause / Resume */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={handlePlayOrTogglePause}
            disabled={!text.trim()}
            aria-label={
              status === 'speaking'
                ? 'إيقاف القراءة مؤقتاً'
                : status === 'paused'
                  ? 'متابعة القراءة الصوتية'
                  : 'الاستماع للنص المُشكَّل'
            }
            className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap ${
              status === 'speaking'
                ? 'bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:border-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300'
            }`}
          >
            {status === 'speaking' ? (
              <>
                <Pause className="w-4 h-4" aria-hidden="true" />
                <span>إيقاف مؤقت</span>
              </>
            ) : status === 'paused' ? (
              <>
                <Play className="w-4 h-4" aria-hidden="true" />
                <span>متابعة</span>
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                <span>استماع للنص</span>
              </>
            )}
          </motion.button>

          {/* Stop */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={stopPlayback}
            disabled={status === 'idle'}
            aria-label="إيقاف القراءة الصوتية"
            className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300 disabled:opacity-40 disabled:pointer-events-none text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Square className="w-3.5 h-3.5" aria-hidden="true" />
            <span>إيقاف</span>
          </motion.button>
        </div>

        {/* Speed & Voice Selectors */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <label htmlFor="speech-rate-select" className="sr-only">
              سرعة القراءة
            </label>
            <select
              id="speech-rate-select"
              value={rate}
              onChange={(e) => handleRateChange(Number(e.target.value))}
              aria-label="سرعة القراءة الصوتية"
              className="min-h-[40px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-600 cursor-pointer"
            >
              {SPEECH_RATE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {arabicVoices.length > 0 && (
            <div className="flex items-center gap-1.5">
              <label htmlFor="speech-voice-select" className="sr-only">
                الصوت العربي
              </label>
              <select
                id="speech-voice-select"
                value={activeVoice?.voiceURI ?? ''}
                onChange={(e) => handleVoiceChange(e.target.value)}
                aria-label="اختيار الصوت العربي"
                className="max-w-[180px] min-h-[40px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-600 cursor-pointer truncate"
              >
                {arabicVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Subtle Progress / Error Feedback */}
      <AnimatePresence>
        {chunkProgress && (
          <motion.p
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            aria-live="polite"
            className="text-xs text-emerald-800 dark:text-emerald-300"
          >
            {status === 'paused' ? 'متوقف مؤقتاً' : 'جاري النطق الصوتي'} — مقطع {chunkProgress.current} من {chunkProgress.total}
            {activeVoice ? ` (${activeVoice.lang})` : ' (العربية)'}
          </motion.p>
        )}
        {speechError && (
          <motion.p
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            role="status"
            className="text-xs text-rose-700 dark:text-rose-300"
          >
            {speechError}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
