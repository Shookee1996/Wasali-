import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkCheck,
  Check,
  ClipboardPaste,
  Copy,
  Download,
  FileText,
  Share2,
  Sparkles,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { FormattingOptionsPanel } from './components/FormattingOptions';
import { HarakatKeyboard } from './components/HarakatKeyboard';
import { Header } from './components/Header';
import { ImageOcrButton } from './components/ImageOcrButton';
import { InteractiveDiacriticView } from './components/InteractiveDiacriticView';
import { SpeechControls } from './components/SpeechControls';
import { StatsStrip } from './components/StatsStrip';
import { SAMPLE_PRESETS } from './data/sampleTexts';
import {
  DEFAULT_FORMATTING_OPTIONS,
  analyzeArabicText,
  applyDiacriticToCluster,
  clustersToString,
  formatArabicText,
  getAdjacentArabicClusterId,
  segmentArabicClusters,
  type FormattingOptions,
} from './utils/arabicEngine';

const STORAGE_KEY_TEXT = 'mishkal_saved_text_v1';
const STORAGE_KEY_OUTPUT = 'mishkal_saved_output_v1';
const STORAGE_KEY_OPTIONS = 'mishkal_options_v1';
const STORAGE_KEY_THEME = 'mishkal_theme_v1';
const STORAGE_KEY_AUTO_FORMAT = 'mishkal_auto_format_v1';
const MAX_UNDO_HISTORY = 20;

interface TextSnapshot {
  inputText: string;
  outputText: string;
}

export default function App() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sampleMenuRef = useRef<HTMLDivElement>(null);
  const lastTypingSnapshotAtRef = useRef<number>(0);

  // Theme state synced with <html>.dark
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem(STORAGE_KEY_THEME);
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(STORAGE_KEY_THEME, isDark ? 'dark' : 'light');
  }, [isDark]);

  // Input & Output text states
  const [inputText, setInputText] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(STORAGE_KEY_TEXT) ?? '';
  });

  const [options, setOptions] = useState<FormattingOptions>(() => {
    if (typeof window === 'undefined') return DEFAULT_FORMATTING_OPTIONS;
    try {
      const saved = localStorage.getItem(STORAGE_KEY_OPTIONS);
      return saved ? { ...DEFAULT_FORMATTING_OPTIONS, ...JSON.parse(saved) } : DEFAULT_FORMATTING_OPTIONS;
    } catch {
      return DEFAULT_FORMATTING_OPTIONS;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_OPTIONS, JSON.stringify(options));
  }, [options]);

  const [autoFormat, setAutoFormat] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem(STORAGE_KEY_AUTO_FORMAT);
    return saved === null ? true : saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_AUTO_FORMAT, String(autoFormat));
  }, [autoFormat]);

  const [outputText, setOutputText] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const savedOutput = localStorage.getItem(STORAGE_KEY_OUTPUT);
    if (savedOutput !== null) return savedOutput;
    const saved = localStorage.getItem(STORAGE_KEY_TEXT) ?? '';
    return saved ? formatArabicText(saved, DEFAULT_FORMATTING_OPTIONS) : '';
  });

  // UI feedback, undo stack & interactive editing state
  const [undoStack, setUndoStack] = useState<TextSnapshot[]>([]);
  const [outputViewMode, setOutputViewMode] = useState<'read' | 'edit'>('read');
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [fontSizeScale, setFontSizeScale] = useState<'md' | 'lg' | 'xl'>('lg');
  const [copied, setCopied] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [clipboardNotice, setClipboardNotice] = useState<string | null>(null);
  const [sampleMenuOpen, setSampleMenuOpen] = useState(false);
  const [processPulse, setProcessPulse] = useState(0);

  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const inputStats = useMemo(() => analyzeArabicText(inputText), [inputText]);
  const outputStats = useMemo(() => analyzeArabicText(outputText), [outputText]);

  const outputClusters = useMemo(() => segmentArabicClusters(outputText), [outputText]);
  const selectedCluster = useMemo(
    () =>
      selectedClusterId !== null
        ? outputClusters.find((c) => c.id === selectedClusterId && c.isArabicLetter) ?? null
        : null,
    [outputClusters, selectedClusterId]
  );

  const pushUndoSnapshot = useCallback((snapshot: TextSnapshot) => {
    setUndoStack((prev) => {
      const top = prev[prev.length - 1];
      if (
        top &&
        top.inputText === snapshot.inputText &&
        top.outputText === snapshot.outputText
      ) {
        return prev;
      }
      return [...prev.slice(-(MAX_UNDO_HISTORY - 1)), snapshot];
    });
  }, []);

  // Close sample menu on outside click or Escape
  useEffect(() => {
    if (!sampleMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (sampleMenuRef.current && !sampleMenuRef.current.contains(event.target as Node)) {
        setSampleMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSampleMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [sampleMenuOpen]);

  // Step to next/previous Arabic letter in Interactive Edit Mode
  const handleStepLetter = useCallback(
    (direction: 'prev' | 'next') => {
      const nextId = getAdjacentArabicClusterId(outputClusters, selectedClusterId, direction);
      if (nextId !== null) {
        setSelectedClusterId(nextId);
      }
    },
    [outputClusters, selectedClusterId]
  );

  // RTL keyboard navigation (ArrowLeft = next letter in RTL, ArrowRight = prev letter)
  useEffect(() => {
    if (outputViewMode !== 'edit' || selectedClusterId === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        handleStepLetter('next');
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        handleStepLetter('prev');
      } else if (event.key === 'Escape') {
        setSelectedClusterId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [outputViewMode, selectedClusterId, handleStepLetter]);

  // Core process handler
  const handleProcessText = (
    textOverride?: string,
    optsOverride?: FormattingOptions,
    recordUndo = true
  ) => {
    const source = textOverride ?? inputText;
    const activeOpts = optsOverride ?? options;
    const result = formatArabicText(source, activeOpts);
    if (recordUndo && result !== outputText) {
      pushUndoSnapshot({ inputText, outputText });
    }
    setOutputText(result);
    setSelectedClusterId(null);
    setProcessPulse((p) => p + 1);
  };

  // Live textarea input change with optional automatic formatting
  const handleInputChange = (nextVal: string) => {
    const now = Date.now();
    if (now - lastTypingSnapshotAtRef.current > 900) {
      pushUndoSnapshot({ inputText, outputText });
      lastTypingSnapshotAtRef.current = now;
    }
    setClipboardNotice(null);
    setInputText(nextVal);
    if (autoFormat) {
      setOutputText(nextVal.trim() ? formatArabicText(nextVal, options) : '');
      setSelectedClusterId(null);
    }
  };

  // Update options and auto-reprocess whenever input has text
  const handleOptionsChange = (nextOptions: FormattingOptions) => {
    setOptions(nextOptions);
    if (inputText.trim() && (autoFormat || outputText.trim())) {
      handleProcessText(inputText, nextOptions, false);
    }
  };

  const handleLoadSample = (sampleText: string) => {
    if (inputText || outputText) {
      pushUndoSnapshot({ inputText, outputText });
    }
    setClipboardNotice(null);
    setInputText(sampleText);
    setSampleMenuOpen(false);
    handleProcessText(sampleText, options, false);
  };

  const handlePasteClipboard = async () => {
    setClipboardNotice(null);
    if (!navigator.clipboard?.readText) {
      setClipboardNotice('المتصفح يمنع القراءة التلقائية؛ الصق النص مباشرةً داخل الحقل (Ctrl+V).');
      textareaRef.current?.focus();
      return;
    }
    try {
      const clipText = await navigator.clipboard.readText();
      if (!clipText.trim()) {
        setClipboardNotice('الحافظة فارغة حالياً.');
        return;
      }
      pushUndoSnapshot({ inputText, outputText });
      setInputText(clipText);
      if (autoFormat) {
        setOutputText(formatArabicText(clipText, options));
        setSelectedClusterId(null);
        setProcessPulse((p) => p + 1);
      }
      textareaRef.current?.focus();
    } catch {
      setClipboardNotice('تعذّر الوصول للحافظة؛ الصق النص مباشرةً داخل الحقل.');
      textareaRef.current?.focus();
    }
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((stack) => stack.slice(0, -1));
    setInputText(prev.inputText);
    setOutputText(prev.outputText);
    setSelectedClusterId(null);
    setClipboardNotice(null);
  };

  const handleClearAll = () => {
    if (inputText || outputText) {
      pushUndoSnapshot({ inputText, outputText });
    }
    setInputText('');
    setOutputText('');
    setSelectedClusterId(null);
    setClipboardNotice(null);
    localStorage.removeItem(STORAGE_KEY_TEXT);
    localStorage.removeItem(STORAGE_KEY_OUTPUT);
    textareaRef.current?.focus();
  };

  const handleSaveLocally = () => {
    localStorage.setItem(STORAGE_KEY_TEXT, inputText);
    localStorage.setItem(STORAGE_KEY_OUTPUT, outputText);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 1800);
  };

  const handleExtractedOcrText = (extracted: string) => {
    pushUndoSnapshot({ inputText, outputText });
    const nextText = inputText.trim() ? `${inputText.trim()}\n\n${extracted}` : extracted;
    setInputText(nextText);
    handleProcessText(nextText, options, false);
  };

  // Manual Harakat application (either to selected interactive letter or textarea cursor)
  const handleApplyHaraka = (mark: string | 'CLEAR') => {
    if (outputViewMode === 'edit' && selectedCluster) {
      pushUndoSnapshot({ inputText, outputText });
      const updatedClusters = outputClusters.map((cluster) =>
        cluster.id === selectedCluster.id
          ? { ...cluster, diacritics: applyDiacriticToCluster(cluster.diacritics, mark) }
          : cluster
      );
      setOutputText(clustersToString(updatedClusters));
      return;
    }

    // Fallback: insert at cursor position inside input textarea
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? inputText.length;
    const end = textarea.selectionEnd ?? inputText.length;

    if (mark === 'CLEAR') {
      // Remove trailing diacritic before cursor if present
      if (start > 0 && /[\u064B-\u065F\u0670]/.test(inputText[start - 1])) {
        pushUndoSnapshot({ inputText, outputText });
        const nextVal = inputText.slice(0, start - 1) + inputText.slice(end);
        setInputText(nextVal);
        if (autoFormat) {
          setOutputText(nextVal.trim() ? formatArabicText(nextVal, options) : '');
        }
        requestAnimationFrame(() => {
          textarea.focus();
          textarea.setSelectionRange(start - 1, start - 1);
        });
      }
      return;
    }

    pushUndoSnapshot({ inputText, outputText });
    const nextVal = inputText.slice(0, start) + mark + inputText.slice(end);
    setInputText(nextVal);
    if (autoFormat) {
      setOutputText(nextVal.trim() ? formatArabicText(nextVal, options) : '');
    }
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + mark.length, start + mark.length);
    });
  };

  const handleCopyOutput = async () => {
    if (!outputText) return;
    try {
      await navigator.clipboard.writeText(outputText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback selection copy
      const temp = document.createElement('textarea');
      temp.value = outputText;
      temp.style.position = 'fixed';
      temp.style.opacity = '0';
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      document.body.removeChild(temp);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleDownloadTxt = () => {
    if (!outputText) return;
    // Include UTF-8 BOM so Windows/Android text editors open Arabic cleanly
    const blob = new Blob(['\uFEFF' + outputText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mishkal-arabic-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleShareOutput = async () => {
    if (!outputText || !canNativeShare) return;
    try {
      await navigator.share({
        title: 'مِشْكال — نص عربي مُشكَّل',
        text: outputText,
      });
    } catch {
      // Ignore user cancellation (AbortError)
    }
  };

  const harakatTargetDescription =
    outputViewMode === 'edit' && selectedCluster
      ? `التعديل يطبَّق مباشرةً على الحرف المحدد في المعاينة التفاعلية.`
      : outputViewMode === 'edit'
        ? `اضغط على أي كلمة في المعاينة التفاعلية لتحديد حرف، أو اكتب في المحرر لإدراج الحركة عند المؤشر.`
        : `تُدرج الحركة عند موضع المؤشر في حقل الإدخال، أو انتقل إلى «التعديل اليدوي» لتشكيل أي حرف باللمس.`;

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen flex flex-col bg-[#f8f9fa] dark:bg-[#0b1120] text-slate-900 dark:text-slate-100">
        <Header isDark={isDark} onToggleTheme={() => setIsDark((prev) => !prev)} />

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
          {/* Editorial Intro Header */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-2 max-w-3xl"
          >
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white [text-wrap:balance]">
              تشكيل وتنسيق النصوص العربية بدقة وسرعة
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              أداة خفيفة تعمل مباشرة في المتصفح والهاتف لإضافة الحركات، ضبط علامات الترقيم، توحيد الحروف، واستخراج النصوص من الصور مع تعديل يدوي فوري.
            </p>
          </motion.section>

          {/* Main 2-Column Workspace */}
          <div
            id="editor-section"
            className="scroll-mt-20 grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start"
          >
            {/* Right Column (RTL start): Input Area & Formatting Options */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: 0.04, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-6 space-y-5"
            >
              <section
                aria-labelledby="input-heading"
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4"
              >
                {/* Input Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2
                    id="input-heading"
                    className="text-base font-bold text-slate-900 dark:text-slate-100"
                  >
                    النص الأصلي
                  </h2>

                  <div className="flex flex-wrap items-center gap-2 relative">
                    {/* Sample Preset Selector */}
                    <div ref={sampleMenuRef} className="relative">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={() => setSampleMenuOpen((o) => !o)}
                        aria-expanded={sampleMenuOpen}
                        className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <FileText className="w-4 h-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                        <span>نص تجريبي</span>
                      </motion.button>

                      <AnimatePresence>
                        {sampleMenuOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: 6, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 4, scale: 0.97 }}
                            transition={{ duration: 0.15 }}
                            className="absolute left-0 sm:right-0 sm:left-auto mt-1.5 w-56 z-20 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg p-1.5 space-y-1"
                          >
                            {SAMPLE_PRESETS.map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => handleLoadSample(preset.text)}
                                className="w-full text-right min-h-[40px] px-3 py-2 rounded-lg text-xs sm:text-sm text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-800 dark:hover:text-emerald-300 transition-colors cursor-pointer"
                              >
                                {preset.label}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* One-Tap Paste */}
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      onClick={handlePasteClipboard}
                      aria-label="لصق من الحافظة"
                      className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <ClipboardPaste className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                      <span>لصق</span>
                    </motion.button>

                    {/* Undo */}
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      onClick={handleUndo}
                      disabled={undoStack.length === 0}
                      aria-label="تراجع عن آخر تعديل"
                      className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Undo2 className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                      <span>تراجع</span>
                    </motion.button>

                    {/* Save to LocalStorage */}
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      onClick={handleSaveLocally}
                      className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {savedNotice ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                          <span className="text-emerald-700 dark:text-emerald-400">تم الحفظ</span>
                        </>
                      ) : (
                        <>
                          <BookmarkCheck className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                          <span>حفظ محلياً</span>
                        </>
                      )}
                    </motion.button>

                    {/* Clear */}
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      onClick={handleClearAll}
                      disabled={!inputText && !outputText}
                      aria-label="مسح النص"
                      className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40 disabled:pointer-events-none text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                      <span>مسح</span>
                    </motion.button>
                  </div>
                </div>

                {/* Inline Clipboard Notice */}
                <AnimatePresence>
                  {clipboardNotice && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      role="status"
                      className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 px-3 py-2 rounded-xl"
                    >
                      {clipboardNotice}
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* Textarea */}
                <div>
                  <label htmlFor="arabic-input-textarea" className="sr-only">
                    أدخل أو الصق النص العربي هنا
                  </label>
                  <textarea
                    id="arabic-input-textarea"
                    ref={textareaRef}
                    dir="rtl"
                    value={inputText}
                    onChange={(e) => handleInputChange(e.target.value)}
                    placeholder="اكتب أو الصق النص العربي هنا لتشكيله وتنسيقه..."
                    rows={7}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-950/60 p-3.5 sm:p-4 font-arabic-prose text-lg sm:text-xl leading-relaxed text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent resize-y transition-shadow"
                  />
                </div>

                {/* Image-to-Text OCR Bar */}
                <div className="pt-1 border-t border-slate-100 dark:border-slate-800/80">
                  <ImageOcrButton onExtractedText={handleExtractedOcrText} />
                </div>

                {/* Live Input Counters */}
                <StatsStrip stats={inputStats} label="إحصائيات الإدخال" />

                {/* Live Auto-Format Toggle + Primary Action CTA */}
                <div className="space-y-2.5">
                  <label className="min-h-[40px] px-1 flex items-center justify-between gap-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                    <span>التشكيل والتنسيق الفوري أثناء الكتابة</span>
                    <input
                      type="checkbox"
                      checked={autoFormat}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        setAutoFormat(enabled);
                        if (enabled && inputText.trim()) {
                          handleProcessText(inputText, options, false);
                        }
                      }}
                      className="w-4 h-4 accent-emerald-700 dark:accent-emerald-500 rounded cursor-pointer shrink-0"
                    />
                  </label>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    whileHover={{ y: -1 }}
                    transition={{ duration: 0.14 }}
                    onClick={() => handleProcessText()}
                    disabled={!inputText.trim()}
                    className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-45 disabled:pointer-events-none text-white font-semibold text-sm sm:text-base flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
                  >
                    <Sparkles className="w-4 h-4" aria-hidden="true" />
                    <span>تشكيل وتنسيق النص</span>
                  </motion.button>
                </div>
              </section>

              {/* Formatting & Normalization Options */}
              <FormattingOptionsPanel options={options} onChange={handleOptionsChange} />
            </motion.div>

            {/* Left Column (RTL end): Formatted Output & Interactive Harakat Keyboard */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-6 space-y-5"
            >
              <section
                aria-labelledby="output-heading"
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4"
              >
                {/* Output Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <h2
                    id="output-heading"
                    className="text-base font-bold text-slate-900 dark:text-slate-100"
                  >
                    النص المُشكَّل والمُنسَّق
                  </h2>

                  {/* View Mode Switch + Font Size */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div
                      role="group"
                      aria-label="وضع العرض"
                      className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setOutputViewMode('read');
                          setSelectedClusterId(null);
                        }}
                        aria-pressed={outputViewMode === 'read'}
                        className={`min-h-[38px] px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                          outputViewMode === 'read'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        عرض القراءة
                      </button>
                      <button
                        type="button"
                        onClick={() => setOutputViewMode('edit')}
                        aria-pressed={outputViewMode === 'edit'}
                        className={`min-h-[38px] px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                          outputViewMode === 'edit'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        تعديل يدوي للحركات
                      </button>
                    </div>

                    {/* Font Size Cycle Button */}
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.95 }}
                      onClick={() =>
                        setFontSizeScale((s) => (s === 'md' ? 'lg' : s === 'lg' ? 'xl' : 'md'))
                      }
                      aria-label="تغيير حجم خط العرض"
                      title="تغيير حجم خط العرض"
                      className="min-h-[44px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Type className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {fontSizeScale === 'xl' ? 'خط كبير' : fontSizeScale === 'lg' ? 'خط متوسط' : 'خط قياسي'}
                      </span>
                    </motion.button>
                  </div>
                </div>

                {/* Output Container */}
                <motion.div
                  key={processPulse}
                  initial={{ opacity: 0.75 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  data-testid="formatted-output"
                  className="min-h-[240px] max-h-[420px] overflow-y-auto rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-4 sm:p-5"
                >
                  <InteractiveDiacriticView
                    text={outputText}
                    viewMode={outputViewMode}
                    selectedClusterId={selectedClusterId}
                    onSelectCluster={setSelectedClusterId}
                    onStepLetter={handleStepLetter}
                    onApplyMark={handleApplyHaraka}
                    onTrySample={() => handleLoadSample(SAMPLE_PRESETS[0].text)}
                    fontSizeScale={fontSizeScale}
                  />
                </motion.div>

                {/* Output Counters */}
                <StatsStrip stats={outputStats} label="إحصائيات الناتج" />

                {/* Text-to-Speech (Web Speech API) */}
                <SpeechControls text={outputText} />

                {/* Export Actions */}
                <div
                  className={`grid grid-cols-1 gap-2.5 pt-1 ${
                    canNativeShare ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
                  }`}
                >
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={handleCopyOutput}
                    disabled={!outputText}
                    className="min-h-[46px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 disabled:opacity-40 disabled:pointer-events-none text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {copied ? (
                        <motion.span
                          key="copied"
                          initial={{ opacity: 0, scale: 0.85 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.85 }}
                          transition={{ duration: 0.15 }}
                          className="inline-flex items-center gap-2 text-emerald-300 dark:text-emerald-700"
                        >
                          <Check className="w-4 h-4" aria-hidden="true" />
                          <span>تم النسخ للحافظة</span>
                        </motion.span>
                      ) : (
                        <motion.span
                          key="copy"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="inline-flex items-center gap-2"
                        >
                          <Copy className="w-4 h-4" aria-hidden="true" />
                          <span>نسخ النص المشكَّل</span>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={handleDownloadTxt}
                    disabled={!outputText}
                    className="min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4" aria-hidden="true" />
                    <span>تحميل كملف .txt</span>
                  </motion.button>

                  {canNativeShare && (
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={handleShareOutput}
                      disabled={!outputText}
                      className="min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Share2 className="w-4 h-4" aria-hidden="true" />
                      <span>مشاركة</span>
                    </motion.button>
                  )}
                </div>
              </section>

              {/* Virtual Harakat Keyboard */}
              <HarakatKeyboard
                selectedLetter={selectedCluster?.base ?? null}
                selectedDiacritics={selectedCluster?.diacritics ?? ''}
                onApplyMark={handleApplyHaraka}
                targetDescription={harakatTargetDescription}
              />
            </motion.div>
          </div>
        </main>

        <footer className="border-t border-slate-200 dark:border-slate-800/80 py-5 px-4 sm:px-6 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          مِشْكال — محرك عربي خفيف لتشكيل وتنسيق النصوص على المتصفح والهاتف
        </footer>
      </div>
    </MotionConfig>
  );
}
