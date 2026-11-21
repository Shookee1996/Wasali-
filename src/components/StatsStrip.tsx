import { motion } from 'motion/react';
import type { TextStats } from '../utils/arabicEngine';

interface StatsStripProps {
  stats: TextStats;
  label?: string;
}

export function StatsStrip({ stats, label }: StatsStripProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
      {label && (
        <span className="font-semibold text-slate-800 dark:text-slate-200">{label}</span>
      )}
      <span className="inline-flex items-center gap-1.5">
        <span>الكلمات:</span>
        <motion.strong
          key={`w-${stats.words}`}
          initial={{ opacity: 0.6, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="font-mono-nums font-semibold text-slate-900 dark:text-slate-100"
        >
          {stats.words}
        </motion.strong>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span>الأحرف (مع التشكيل):</span>
        <strong className="font-mono-nums font-semibold text-slate-900 dark:text-slate-100">
          {stats.charsWithDiacritics}
        </strong>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span>بدون تشكيل:</span>
        <strong className="font-mono-nums font-semibold text-slate-900 dark:text-slate-100">
          {stats.charsWithoutDiacritics}
        </strong>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span>الحركات:</span>
        <strong className="font-mono-nums font-semibold text-emerald-700 dark:text-emerald-400">
          {stats.diacriticMarks}
        </strong>
      </span>
    </div>
  );
}
