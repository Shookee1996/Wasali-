import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { preprocessImageForOcr } from '../utils/imagePreprocess';

interface ImageOcrButtonProps {
  onExtractedText: (text: string) => void;
}

export function ImageOcrButton({ onExtractedText }: ImageOcrButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [enhanceContrast, setEnhanceContrast] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset input value so selecting the same file again still fires onChange
    event.target.value = '';
    if (!file) return;

    setErrorMessage(null);
    setIsProcessing(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const prepared = await preprocessImageForOcr(file, enhanceContrast);

      const response = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: prepared.base64,
          mimeType: prepared.mimeType,
          preserveDiacritics: true,
        }),
        signal: controller.signal,
      });

      const data = (await response.json().catch(() => ({}))) as {
        text?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || 'تعذر استخراج النص من الصورة حالياً.');
      }

      if (!data.text || !data.text.trim()) {
        throw new Error('لم يتم العثور على نص مقروء داخل الصورة.');
      }

      onExtractedText(data.text.trim());
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setErrorMessage('تم إلغاء عملية استخراج النص من الصورة.');
      } else {
        setErrorMessage(
          err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء معالجة الصورة.'
        );
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handleFileChange}
          className="hidden"
          aria-label="اختيار صورة لاستخراج النص العربي منها"
        />

        {!isProcessing ? (
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              setErrorMessage(null);
              fileInputRef.current?.click();
            }}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <ImagePlus className="w-4 h-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            <span>استخراج من صورة</span>
          </motion.button>
        ) : (
          <div className="inline-flex items-center gap-2">
            <span className="min-h-[44px] px-3.5 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm font-medium inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              <span>جارٍ استخراج النص...</span>
            </span>
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={handleCancel}
              aria-label="إلغاء استخراج النص"
              className="min-h-[44px] min-w-[44px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </motion.button>
          </div>
        )}

        <label className="min-h-[44px] px-2 inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enhanceContrast}
            onChange={(e) => setEnhanceContrast(e.target.checked)}
            className="w-4 h-4 accent-emerald-700 dark:accent-emerald-500 rounded cursor-pointer"
          />
          <span>تحسين تباين الصورة تلقائياً</span>
        </label>
      </div>

      <AnimatePresence>
        {errorMessage && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="flex items-start justify-between gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 text-xs sm:text-sm text-rose-800 dark:text-rose-200"
          >
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              aria-label="إغلاق رسالة الخطأ"
              className="p-1 rounded-md hover:bg-rose-100 dark:hover:bg-rose-900/50 cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
