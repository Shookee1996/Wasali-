import { motion } from 'motion/react';
import {
  FORMATTING_PRESETS,
  type DiacritizationMode,
  type FormattingOptions,
  type HamzaStandardizationMode,
  type TehHaaMode,
} from '../utils/arabicEngine';

interface FormattingOptionsPanelProps {
  options: FormattingOptions;
  onChange: (next: FormattingOptions) => void;
}

const DIACRITIZATION_MODES: { value: DiacritizationMode; label: string }[] = [
  { value: 'full', label: 'تشكيل كامل' },
  { value: 'partial', label: 'تشكيل جزئي' },
  { value: 'none', label: 'إزالة التشكيل' },
];

type BooleanOptionKey =
  | 'removeExtraSpaces'
  | 'collapseEmptyLines'
  | 'fixPunctuation'
  | 'convertLatinPunctuation'
  | 'removeTatweel'
  | 'normalizeAlefMaqsura';

interface ToggleOption {
  key: BooleanOptionKey;
  label: string;
}

const CLEANUP_TOGGLES: ToggleOption[] = [
  { key: 'removeExtraSpaces', label: 'إزالة المسافات الزائدة' },
  { key: 'collapseEmptyLines', label: 'دمج السطور الفارغة المتكررة' },
  { key: 'fixPunctuation', label: 'تصحيح مسافات الترقيم' },
  { key: 'convertLatinPunctuation', label: 'تحويل الترقيم اللاتيني (، ؛ ؟)' },
];

const EXTRA_LETTER_TOGGLES: ToggleOption[] = [
  { key: 'removeTatweel', label: 'إزالة التطويل (ـ)' },
  { key: 'normalizeAlefMaqsura', label: 'توحيد الياء المقصورة (ى ← ي)' },
];

const HAMZA_MODES: { value: HamzaStandardizationMode; label: string }[] = [
  { value: 'none', label: 'الإبقاء على أشكال الهمزة الأصلية' },
  { value: 'alef_only', label: 'توحيد همزات الألف (أ إ آ ← ا)' },
  { value: 'all_to_alef', label: 'توحيد جميع الهمزات إلى ألف (أ إ آ ؤ ئ ← ا)' },
  { value: 'all_to_hamza', label: 'توحيد الهمزات إلى همزة مفردة (أ إ آ ؤ ئ ← ء)' },
];

const TEH_HAA_MODES: { value: TehHaaMode; label: string }[] = [
  { value: 'smart_correct', label: 'تمييز ذكي حسب السياق (ة / ه)' },
  { value: 'none', label: 'بدون تعديل' },
  { value: 'unify_to_haa', label: 'توحيد التاء المربوطة إلى هاء (ة ← ه)' },
];

export function FormattingOptionsPanel({ options, onChange }: FormattingOptionsPanelProps) {
  const handleToggle = (key: BooleanOptionKey) => {
    onChange({
      ...options,
      [key]: !options[key],
    });
  };

  return (
    <section
      id="formatting-section"
      aria-labelledby="formatting-heading"
      className="scroll-mt-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2
          id="formatting-heading"
          className="text-base font-bold text-slate-900 dark:text-slate-100"
        >
          خيارات التشكيل والتنسيق
        </h2>

        {/* Segmented Diacritization Mode Control */}
        <div
          role="group"
          aria-label="مستوى التشكيل"
          className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl w-full sm:w-auto"
        >
          {DIACRITIZATION_MODES.map((mode) => {
            const active = options.diacritizationMode === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                onClick={() => onChange({ ...options, diacritizationMode: mode.value })}
                aria-pressed={active}
                className={`relative flex-1 sm:flex-initial min-h-[40px] px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                  active
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="diacritization-mode-pill"
                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    className="absolute inset-0 bg-white dark:bg-slate-900 rounded-lg shadow-xs border border-slate-200/70 dark:border-slate-700"
                    aria-hidden="true"
                  />
                )}
                <span className="relative z-10">{mode.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* One-Tap Workflow Presets */}
      <div className="space-y-1.5">
        <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">
          قوالب إعداد جاهزة بنقرة واحدة
        </span>
        <div className="flex flex-wrap gap-2">
          {FORMATTING_PRESETS.map((preset) => {
            const isMatching =
              options.diacritizationMode === preset.options.diacritizationMode &&
              options.hamzaMode === preset.options.hamzaMode &&
              options.tehHaaMode === preset.options.tehHaaMode &&
              options.normalizeAlefMaqsura === preset.options.normalizeAlefMaqsura;
            return (
              <motion.button
                key={preset.id}
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => onChange({ ...preset.options })}
                title={preset.description}
                aria-pressed={isMatching}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  isMatching
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500/70 text-emerald-800 dark:text-emerald-200'
                    : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:border-emerald-400'
                }`}
              >
                {preset.label}
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 border-t border-slate-100 dark:border-slate-800/80">
        {/* Formatting & Punctuation Group */}
        <div className="space-y-2.5 pt-2">
          <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            تنسيق المسافات وعلامات الترقيم
          </h3>
          <div className="grid grid-cols-1 gap-1.5">
            {CLEANUP_TOGGLES.map((item) => (
              <label
                key={item.key}
                className="min-h-[44px] px-3 py-2 rounded-xl flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer select-none"
              >
                <span className="text-sm text-slate-800 dark:text-slate-200">{item.label}</span>
                <input
                  type="checkbox"
                  checked={options[item.key]}
                  onChange={() => handleToggle(item.key)}
                  className="w-4 h-4 accent-emerald-700 dark:accent-emerald-500 rounded cursor-pointer shrink-0"
                />
              </label>
            ))}
          </div>
        </div>

        {/* Advanced Linguistic & Letter Normalization Group */}
        <div className="space-y-2.5 pt-2">
          <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            القواعد المتقدمة وتوحيد الحروف
          </h3>
          <div className="space-y-2.5">
            {/* Configurable Hamza Standardization */}
            <div className="space-y-1 px-1">
              <label
                htmlFor="hamza-mode-select"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                معالجة وتوحيد الهمزات
              </label>
              <select
                id="hamza-mode-select"
                value={options.hamzaMode}
                onChange={(e) =>
                  onChange({
                    ...options,
                    hamzaMode: e.target.value as HamzaStandardizationMode,
                  })
                }
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600 cursor-pointer"
              >
                {HAMZA_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Configurable Taa Marbuta vs Haa Differentiation */}
            <div className="space-y-1 px-1">
              <label
                htmlFor="teh-haa-mode-select"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                التاء المربوطة والهاء (ة / ه)
              </label>
              <select
                id="teh-haa-mode-select"
                value={options.tehHaaMode}
                onChange={(e) =>
                  onChange({
                    ...options,
                    tehHaaMode: e.target.value as TehHaaMode,
                  })
                }
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600 cursor-pointer"
              >
                {TEH_HAA_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Tatweel & Alef Maqsura toggles */}
            <div className="grid grid-cols-1 gap-1">
              {EXTRA_LETTER_TOGGLES.map((item) => (
                <label
                  key={item.key}
                  className="min-h-[44px] px-3 py-2 rounded-xl flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer select-none"
                >
                  <span className="text-sm text-slate-800 dark:text-slate-200">{item.label}</span>
                  <input
                    type="checkbox"
                    checked={options[item.key]}
                    onChange={() => handleToggle(item.key)}
                    className="w-4 h-4 accent-emerald-700 dark:accent-emerald-500 rounded cursor-pointer shrink-0"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
