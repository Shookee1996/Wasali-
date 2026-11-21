import { Eraser } from 'lucide-react';
import { motion } from 'motion/react';
import { HARAKAT } from '../utils/arabicEngine';

interface HarakatKeyboardProps {
  selectedLetter: string | null;
  selectedDiacritics: string;
  onApplyMark: (mark: string | 'CLEAR') => void;
  targetDescription: string;
}

interface HarakaKey {
  mark: string;
  preview: string;
  name: string;
  shortcut: string;
}

const HARAKA_KEYS: HarakaKey[] = [
  { mark: HARAKAT.FATHA, preview: 'بَ', name: 'فَتْحة', shortcut: 'َ' },
  { mark: HARAKAT.DAMMA, preview: 'بُ', name: 'ضَمّة', shortcut: 'ُ' },
  { mark: HARAKAT.KASRA, preview: 'بِ', name: 'كَسْرة', shortcut: 'ِ' },
  { mark: HARAKAT.SUKUN, preview: 'بْ', name: 'سُكون', shortcut: 'ْ' },
  { mark: HARAKAT.SHADDA, preview: 'بّ', name: 'شَدّة', shortcut: 'ّ' },
  { mark: HARAKAT.FATHATAN, preview: 'بً', name: 'تنوين فتح', shortcut: 'ً' },
  { mark: HARAKAT.DAMMATAN, preview: 'بٌ', name: 'تنوين ضم', shortcut: 'ٌ' },
  { mark: HARAKAT.KASRATAN, preview: 'بٍ', name: 'تنوين كسر', shortcut: 'ٍ' },
  { mark: HARAKAT.MADDAH, preview: 'آ', name: 'مَدّة', shortcut: 'ٓ' },
  { mark: HARAKAT.SUPERSCRIPT_ALEF, preview: 'بٰ', name: 'ألف خنجرية', shortcut: 'ٰ' },
];

export function HarakatKeyboard({
  selectedLetter,
  selectedDiacritics,
  onApplyMark,
  targetDescription,
}: HarakatKeyboardProps) {
  return (
    <section
      id="harakat-section"
      aria-labelledby="harakat-keyboard-heading"
      className="scroll-mt-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <h2
            id="harakat-keyboard-heading"
            className="text-base font-bold text-slate-900 dark:text-slate-100"
          >
            لوحة الحركات التفاعلية
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{targetDescription}</p>
        </div>

        {selectedLetter && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.16 }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70"
          >
            <span className="text-xs text-emerald-800 dark:text-emerald-300">الحرف المحدد:</span>
            <span className="font-arabic-prose text-xl font-bold text-emerald-900 dark:text-emerald-100 leading-none">
              {selectedLetter + selectedDiacritics}
            </span>
          </motion.div>
        )}
      </div>

      <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-2">
        {HARAKA_KEYS.map((item) => {
          const isActive = selectedLetter !== null && selectedDiacritics.includes(item.mark);
          const displayPreview = selectedLetter ? selectedLetter + item.mark : item.preview;
          return (
            <motion.button
              key={item.name}
              type="button"
              whileTap={{ scale: 0.94 }}
              whileHover={{ y: -1 }}
              transition={{ duration: 0.12 }}
              onClick={() => onApplyMark(item.mark)}
              aria-label={`تطبيق ${item.name}`}
              aria-pressed={isActive}
              className={`min-h-[54px] px-2 py-2 rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                isActive
                  ? 'bg-emerald-700 text-white border-emerald-700 dark:bg-emerald-600 dark:border-emerald-500'
                  : 'bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700/80 hover:border-emerald-500 dark:hover:border-emerald-500 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30'
              }`}
            >
              <span className="font-arabic-prose text-xl leading-tight font-bold">
                {displayPreview}
              </span>
              <span
                className={`text-[11px] font-medium whitespace-nowrap ${
                  isActive ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {item.name}
              </span>
            </motion.button>
          );
        })}

        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          whileHover={{ y: -1 }}
          transition={{ duration: 0.12 }}
          onClick={() => onApplyMark('CLEAR')}
          aria-label="إزالة حركة الحرف المحدد"
          className="min-h-[54px] px-2 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/60 flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        >
          <Eraser className="w-4 h-4" aria-hidden="true" />
          <span className="text-[11px] font-medium whitespace-nowrap">بلا حركة</span>
        </motion.button>
      </div>
    </section>
  );
}
