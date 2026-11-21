import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Eraser, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ARABIC_LETTER_REGEX,
  HARAKAT,
  segmentArabicClusters,
  type ArabicCluster,
} from '../utils/arabicEngine';

interface InteractiveDiacriticViewProps {
  text: string;
  viewMode: 'read' | 'edit';
  selectedClusterId: number | null;
  onSelectCluster: (clusterId: number | null) => void;
  onStepLetter: (direction: 'prev' | 'next') => void;
  onApplyMark: (mark: string | 'CLEAR') => void;
  onTrySample: () => void;
  fontSizeScale: 'md' | 'lg' | 'xl';
}

interface WordToken {
  key: string;
  isWord: boolean;
  raw: string;
  clusters: ArabicCluster[];
}

const QUICK_MARKS: { mark: string; label: string }[] = [
  { mark: HARAKAT.FATHA, label: 'فَتْحة' },
  { mark: HARAKAT.DAMMA, label: 'ضَمّة' },
  { mark: HARAKAT.KASRA, label: 'كَسْرة' },
  { mark: HARAKAT.SUKUN, label: 'سُكون' },
  { mark: HARAKAT.SHADDA, label: 'شَدّة' },
];

export function InteractiveDiacriticView({
  text,
  viewMode,
  selectedClusterId,
  onSelectCluster,
  onStepLetter,
  onApplyMark,
  onTrySample,
  fontSizeScale,
}: InteractiveDiacriticViewProps) {
  const clusters = useMemo(() => segmentArabicClusters(text), [text]);

  // Group clusters into connected word tokens vs whitespace/punctuation so Arabic cursive shaping stays intact
  const tokens = useMemo<WordToken[]>(() => {
    const result: WordToken[] = [];
    let currentClusters: ArabicCluster[] = [];
    let tokenIdx = 0;

    const flush = () => {
      if (currentClusters.length > 0) {
        const hasArabic = currentClusters.some((c) => c.isArabicLetter);
        result.push({
          key: `tok-${tokenIdx++}`,
          isWord: hasArabic,
          raw: currentClusters.map((c) => c.base + c.diacritics).join(''),
          clusters: currentClusters,
        });
        currentClusters = [];
      }
    };

    for (const c of clusters) {
      if (c.isWhitespace || (!c.isArabicLetter && !ARABIC_LETTER_REGEX.test(c.base))) {
        flush();
        result.push({
          key: `sep-${tokenIdx++}`,
          isWord: false,
          raw: c.base + c.diacritics,
          clusters: [c],
        });
      } else {
        currentClusters.push(c);
      }
    }
    flush();
    return result;
  }, [clusters]);

  // Find which word contains the currently selected cluster
  const selectedWordToken = useMemo(() => {
    if (selectedClusterId === null) return null;
    return (
      tokens.find(
        (t) => t.isWord && t.clusters.some((c) => c.id === selectedClusterId)
      ) ?? null
    );
  }, [tokens, selectedClusterId]);

  const selectedCluster = useMemo(
    () =>
      selectedClusterId !== null
        ? clusters.find((c) => c.id === selectedClusterId && c.isArabicLetter) ?? null
        : null,
    [clusters, selectedClusterId]
  );

  const proseSizeClass =
    fontSizeScale === 'xl'
      ? 'text-2xl sm:text-3xl leading-[2.2]'
      : fontSizeScale === 'lg'
        ? 'text-xl sm:text-2xl leading-[2.1]'
        : 'text-lg sm:text-xl leading-[2.0]';

  if (!text.trim()) {
    return (
      <div className="min-h-[220px] flex flex-col items-center justify-center text-center p-6 gap-3 text-slate-400 dark:text-slate-500">
        <div className="space-y-1">
          <p className="text-base font-medium text-slate-600 dark:text-slate-300">
            لا يوجد نص مُشكَّل للعرض بعد
          </p>
          <p className="text-xs sm:text-sm">
            ابدأ بالكتابة أو اللصق في المحرر، أو جرّب نصاً عربياً جاهزاً بنقرة واحدة.
          </p>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={onTrySample}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
        >
          <Sparkles className="w-4 h-4" aria-hidden="true" />
          <span>جرّب نصاً جاهزاً</span>
        </motion.button>
      </div>
    );
  }

  if (viewMode === 'read') {
    return (
      <motion.div
        key="read-view"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className={`font-arabic-prose whitespace-pre-wrap break-words text-slate-900 dark:text-slate-100 select-text ${proseSizeClass}`}
      >
        {text}
      </motion.div>
    );
  }

  return (
    <motion.div
      key="edit-view"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      {/* Active Word Letter Inspector with inline quick-harakat & step navigation */}
      <AnimatePresence mode="wait">
        {selectedWordToken ? (
          <motion.div
            key={selectedWordToken.key}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-900 dark:text-emerald-200">
              <span className="font-semibold">
                الكلمة ({selectedWordToken.raw}) — اختر الحرف أو تنقل بالأسهم:
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onStepLetter('prev')}
                  aria-label="الحرف السابق"
                  className="min-h-[36px] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 inline-flex items-center gap-1 text-xs font-medium cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>السابق</span>
                </button>
                <button
                  type="button"
                  onClick={() => onStepLetter('next')}
                  aria-label="الحرف التالي"
                  className="min-h-[36px] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 inline-flex items-center gap-1 text-xs font-medium cursor-pointer"
                >
                  <span>التالي</span>
                  <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onSelectCluster(null)}
                  className="min-h-[36px] px-2 text-xs underline underline-offset-4 hover:text-emerald-700 dark:hover:text-emerald-300 cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>

            {/* Letter Tiles */}
            <div className="flex flex-wrap items-center gap-2">
              {selectedWordToken.clusters.map((cluster) => {
                const isSelected = cluster.id === selectedClusterId;
                return (
                  <motion.button
                    key={cluster.id}
                    type="button"
                    whileTap={{ scale: 0.93 }}
                    onClick={() => onSelectCluster(cluster.id)}
                    aria-label={`تحديد الحرف ${cluster.base}`}
                    aria-pressed={isSelected}
                    className={`min-w-[48px] min-h-[52px] px-2.5 py-1.5 rounded-xl border font-arabic-prose text-2xl font-bold flex flex-col items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                      isSelected
                        ? 'bg-emerald-700 text-white border-emerald-700 dark:bg-emerald-600 dark:border-emerald-500 shadow-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-emerald-200/80 dark:border-slate-700 hover:border-emerald-500'
                    }`}
                  >
                    <span>{cluster.base + cluster.diacritics}</span>
                  </motion.button>
                );
              })}
            </div>

            {/* Inline Quick Harakat Row (instant reach on mobile without scrolling) */}
            {selectedCluster && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-emerald-200/70 dark:border-emerald-800/50">
                {QUICK_MARKS.map((item) => {
                  const active = selectedCluster.diacritics.includes(item.mark);
                  return (
                    <motion.button
                      key={item.label}
                      type="button"
                      whileTap={{ scale: 0.93 }}
                      onClick={() => onApplyMark(item.mark)}
                      aria-label={`تطبيق سريع: ${item.label}`}
                      aria-pressed={active}
                      className={`min-h-[40px] min-w-[44px] px-2.5 py-1 rounded-lg border font-arabic-prose text-lg font-bold transition-colors cursor-pointer ${
                        active
                          ? 'bg-emerald-700 text-white border-emerald-700 dark:bg-emerald-600'
                          : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border-emerald-200/80 dark:border-slate-700 hover:border-emerald-500'
                      }`}
                    >
                      {selectedCluster.base + item.mark}
                    </motion.button>
                  );
                })}
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.93 }}
                  onClick={() => onApplyMark('CLEAR')}
                  aria-label="مسح حركة الحرف"
                  className="min-h-[40px] px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                >
                  <Eraser className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>بلا</span>
                </motion.button>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.p
            key="hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 rounded-xl border border-slate-200/70 dark:border-slate-800"
          >
            اضغط على أي كلمة في النص أدناه لعرض حروفها وتعديل التشكيل يدوياً بنقرة واحدة.
          </motion.p>
        )}
      </AnimatePresence>

      {/* Connected Arabic Words (Preserves 100% authentic cursive ligatures) */}
      <div
        className={`font-arabic-prose whitespace-pre-wrap break-words text-slate-900 dark:text-slate-100 ${proseSizeClass}`}
      >
        {tokens.map((tok) => {
          if (!tok.isWord) {
            return <span key={tok.key}>{tok.raw}</span>;
          }
          const isWordSelected =
            selectedClusterId !== null &&
            tok.clusters.some((c) => c.id === selectedClusterId);
          const firstArabicCluster = tok.clusters.find((c) => c.isArabicLetter);

          return (
            <button
              key={tok.key}
              type="button"
              onClick={() => {
                if (firstArabicCluster) {
                  onSelectCluster(firstArabicCluster.id);
                }
              }}
              aria-label={`تعديل تشكيل كلمة ${tok.raw}`}
              className={`inline rounded-md px-1 -mx-0.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                isWordSelected
                  ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-950 dark:text-emerald-100 ring-1 ring-emerald-500/50'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {tok.raw}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
