/**
 * Arabic Text Diacritization, Formatting, and Cluster Inspection Engine.
 * Designed to run 100% client-side with zero external dependencies or server calls.
 */

export const HARAKAT = {
  FATHATAN: '\u064B', // ً
  DAMMATAN: '\u064C', // ٌ
  KASRATAN: '\u064D', // ٍ
  FATHA: '\u064E', // َ
  DAMMA: '\u064F', // ُ
  KASRA: '\u0650', // ِ
  SHADDA: '\u0651', // ّ
  SUKUN: '\u0652', // ْ
  MADDAH: '\u0653', // ٓ
  SUPERSCRIPT_ALEF: '\u0670', // ٰ
} as const;

export const DIACRITIC_REGEX = /[\u064B-\u065F\u0670]/g;
export const SINGLE_DIACRITIC_REGEX = /^[\u064B-\u065F\u0670]$/;
export const ARABIC_LETTER_REGEX = /[\u0621-\u064A\u066E-\u066F\u0671-\u06D3]/;

const SUN_LETTERS = new Set([
  'ت', 'ث', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ل', 'ن',
]);

export type DiacritizationMode = 'none' | 'partial' | 'full';

/**
 * Configurable modes for standardizing the various Arabic Hamza carriers:
 * - `'none'`: Preserve all original Hamza forms (`أ`, `إ`, `آ`, `ؤ`, `ئ`, `ء`).
 * - `'alef_only'`: Standardize Alef-based Hamzas (`أ`, `إ`, `آ`, `ٱ`) to bare Alef (`ا`) while keeping `ؤ` and `ئ`.
 * - `'all_to_alef'`: Standardize all Hamza carrier forms (`أ`, `إ`, `آ`, `ٱ`, `ؤ`, `ئ`) to bare Alef (`ا`).
 * - `'all_to_hamza'`: Standardize all Hamza carrier forms (`أ`, `إ`, `آ`, `ٱ`, `ؤ`, `ئ`) to standalone Hamza (`ء`).
 */
export type HamzaStandardizationMode = 'none' | 'alef_only' | 'all_to_alef' | 'all_to_hamza';

/**
 * Configurable modes for handling final Taa Marbuta (`ة`) vs. Haa (`ه`):
 * - `'none'`: Leave final `ة` and `ه` untouched.
 * - `'smart_correct'`: Contextually differentiate `ة` and `ه` using Arabic morphological and syntactic rules.
 * - `'unify_to_haa'`: Normalize all `ة` occurrences to `ه` (useful for search indexing).
 */
export type TehHaaMode = 'none' | 'smart_correct' | 'unify_to_haa';

export interface FormattingOptions {
  diacritizationMode: DiacritizationMode;
  removeExtraSpaces: boolean;
  collapseEmptyLines: boolean;
  fixPunctuation: boolean;
  convertLatinPunctuation: boolean;
  hamzaMode: HamzaStandardizationMode;
  tehHaaMode: TehHaaMode;
  normalizeAlefMaqsura: boolean;
  removeTatweel: boolean;
  /** @deprecated Use `hamzaMode` instead. Kept for backward compatibility. */
  normalizeAlef?: boolean;
  /** @deprecated Use `tehHaaMode` instead. Kept for backward compatibility. */
  normalizeTehMarbuta?: boolean;
}

export const DEFAULT_FORMATTING_OPTIONS: FormattingOptions = {
  diacritizationMode: 'full',
  removeExtraSpaces: true,
  collapseEmptyLines: true,
  fixPunctuation: true,
  convertLatinPunctuation: true,
  hamzaMode: 'none',
  tehHaaMode: 'smart_correct',
  normalizeAlefMaqsura: false,
  removeTatweel: true,
};

export interface TextStats {
  words: number;
  charsWithDiacritics: number;
  charsWithoutDiacritics: number;
  diacriticMarks: number;
  lines: number;
}

export interface ArabicCluster {
  id: number;
  base: string;
  diacritics: string;
  isArabicLetter: boolean;
  isWhitespace: boolean;
}

/**
 * Curated high-frequency Arabic lexicon mapped from unvocalized form -> fully vocalized form.
 */
const ARABIC_LEXICON: Record<string, string> = {
  // Prepositions & Particles
  'في': 'فِي',
  'من': 'مِنْ',
  'إلى': 'إِلَى',
  'الى': 'إِلَى',
  'على': 'عَلَى',
  'عن': 'عَنْ',
  'مع': 'مَعَ',
  'بين': 'بَيْنَ',
  'منذ': 'مُنْذُ',
  'حتى': 'حَتَّى',
  'نحو': 'نَحْوَ',
  'حول': 'حَوْلَ',
  'خلال': 'خِلَالَ',
  'ضد': 'ضِدَّ',
  'فوق': 'فَوْقَ',
  'تحت': 'تَحْتَ',
  'أمام': 'أَمَامَ',
  'وراء': 'وَرَاءَ',
  'خلف': 'خَلْفَ',
  'عند': 'عِنْدَ',
  'لدى': 'لَدَى',
  'قبل': 'قَبْلَ',
  'بعد': 'بَعْدَ',
  'دون': 'دُونَ',
  'بدون': 'بِدُونِ',
  'عبر': 'عَبْرَ',
  'رغم': 'رَغْمَ',
  'سوى': 'سِوَى',
  'نفس': 'نَفْسُ',
  'ذات': 'ذَاتُ',

  // Preposition + Pronoun compounds
  'منه': 'مِنْهُ',
  'منها': 'مِنْهَا',
  'منهم': 'مِنْهُمْ',
  'منك': 'مِنْكَ',
  'منا': 'مِنَّا',
  'فيه': 'فِيهِ',
  'فيها': 'فِيهَا',
  'فيهم': 'فِيهِمْ',
  'فيك': 'فِيكَ',
  'فينا': 'فِينَا',
  'إليه': 'إِلَيْهِ',
  'إليها': 'إِلَيْهَا',
  'إليهم': 'إِلَيْهِمْ',
  'عليه': 'عَلَيْهِ',
  'عليها': 'عَلَيْهَا',
  'عليهم': 'عَلَيْهِمْ',
  'علينا': 'عَلَيْنَا',
  'عليك': 'عَلَيْكَ',
  'عليكم': 'عَلَيْكُمْ',
  'عنه': 'عَنْهُ',
  'عنها': 'عَنْهَا',
  'عنهم': 'عَنْهُمْ',
  'به': 'بِهِ',
  'بها': 'بِهَا',
  'بهم': 'بِهِمْ',
  'بنا': 'بِنَا',
  'بك': 'بِكَ',
  'بكم': 'بِكُمْ',
  'له': 'لَهُ',
  'لها': 'لَهَا',
  'لهم': 'لَهُمْ',
  'لنا': 'لَنَا',
  'لك': 'لَكَ',
  'لكم': 'لَكُمْ',
  'معه': 'مَعَهُ',
  'معها': 'مَعَهَا',
  'معهم': 'مَعَهُمْ',
  'معنا': 'مَعَنَا',
  'بينها': 'بَيْنَهَا',
  'بينهم': 'بَيْنَهُمْ',

  // Conjunctions & Discourse markers
  'و': 'وَ',
  'أو': 'أَوْ',
  'أم': 'أَمْ',
  'ثم': 'ثُمَّ',
  'لكن': 'لَكِنْ',
  'ولكن': 'وَلَكِنْ',
  'بل': 'بَلْ',
  'إن': 'إِنَّ',
  'أن': 'أَنَّ',
  'كأن': 'كَأَنَّ',
  'لعل': 'لَعَلَّ',
  'ليت': 'لَيْتَ',
  'لأن': 'لِأَنَّ',
  'لأنه': 'لِأَنَّهُ',
  'لأنها': 'لِأَنَّهَا',
  'بأن': 'بِأَنَّ',
  'حيث': 'حَيْثُ',
  'إذ': 'إِذْ',
  'إذا': 'إِذَا',
  'لو': 'لَوْ',
  'لولا': 'لَوْلَا',
  'كي': 'كَيْ',
  'لكي': 'لِكَيْ',
  'لا': 'لَا',
  'لم': 'لَمْ',
  'لن': 'لَنْ',
  'قد': 'قَدْ',
  'لقد': 'لَقَدْ',
  'ما': 'مَا',
  'مما': 'مِمَّا',
  'عما': 'عَمَّا',
  'فيما': 'فِيمَا',
  'بينما': 'بَيْنَمَا',
  'عندما': 'عِنْدَمَا',
  'كلما': 'كُلَّمَا',
  'كما': 'كَمَا',
  'هل': 'هَلْ',
  'كيف': 'كَيْفَ',
  'أين': 'أَيْنَ',
  'متى': 'مَتَى',
  'لماذا': 'لِمَاذَا',
  'ماذا': 'مَاذَا',
  'كم': 'كَمْ',
  'أي': 'أَيُّ',
  'نعم': 'نَعَمْ',
  'كلا': 'كَلَّا',

  // Pronouns, Demonstratives, Relatives
  'أنا': 'أَنَا',
  'نحن': 'نَحْنُ',
  'أنت': 'أَنْتَ',
  'أنتم': 'أَنْتُمْ',
  'أنتما': 'أَنْتُمَا',
  'أنتن': 'أَنْتُنَّ',
  'هو': 'هُوَ',
  'هي': 'هِيَ',
  'هما': 'هُمَا',
  'هم': 'هُمْ',
  'هن': 'هُنَّ',
  'هذا': 'هَذَا',
  'هذه': 'هَذِهِ',
  'هذان': 'هَذَانِ',
  'هاتان': 'هَاتَانِ',
  'هؤلاء': 'هَؤُلَاءِ',
  'ذلك': 'ذَلِكَ',
  'تلك': 'تِلْكَ',
  'أولئك': 'أُولَئِكَ',
  'هنا': 'هُنَا',
  'هناك': 'هُنَاكَ',
  'الذي': 'الَّذِي',
  'التي': 'الَّتِي',
  'اللذان': 'اللَّذَانِ',
  'اللتان': 'اللَّتَانِ',
  'الذين': 'الَّذِينَ',
  'اللاتي': 'اللَّاتِي',
  'اللواتي': 'اللَّوَاتِي',
  'كل': 'كُلُّ',
  'بعض': 'بَعْضُ',
  'جميع': 'جَمِيعُ',
  'معظم': 'مُعْظَمُ',
  'كثير': 'كَثِيرٌ',
  'قليل': 'قَلِيلٌ',
  'غير': 'غَيْرُ',
  'مثل': 'مِثْلُ',

  // Common Verbs
  'كان': 'كَانَ',
  'كانت': 'كَانَتْ',
  'كانوا': 'كَانُوا',
  'يكون': 'يَكُونُ',
  'تكون': 'تَكُونُ',
  'أصبح': 'أَصْبَحَ',
  'أصبحت': 'أَصْبَحَتْ',
  'يصبح': 'يُصْبِحُ',
  'تصبح': 'تُصْبِحُ',
  'صار': 'صَارَ',
  'ليس': 'لَيْسَ',
  'ليست': 'لَيْسَتْ',
  'قال': 'قَالَ',
  'قالت': 'قَالَتْ',
  'يقول': 'يَقُولُ',
  'تقول': 'تَقُولُ',
  'كتب': 'كَتَبَ',
  'كتبت': 'كَتَبَتْ',
  'يكتب': 'يَكْتُبُ',
  'تكتب': 'تَكْتُبُ',
  'قرأ': 'قَرَأَ',
  'يقرأ': 'يَقْرَأُ',
  'تقرأ': 'تَقْرَأُ',
  'علم': 'عَلِمَ',
  'يعلم': 'يَعْلَمُ',
  'تعلم': 'تَعْلَمُ',
  'فهم': 'فَهِمَ',
  'يفهم': 'يَفْهَمُ',
  'عمل': 'عَمِلَ',
  'يعمل': 'يَعْمَلُ',
  'تعمل': 'تَعْمَلُ',
  'جعل': 'جَعَلَ',
  'يجعل': 'يَجْعَلُ',
  'تجعل': 'تَجْعَلُ',
  'أراد': 'أَرَادَ',
  'يريد': 'يُرِيدُ',
  'تريد': 'تُرِيدُ',
  'استطاع': 'اسْتَطَاعَ',
  'يستطيع': 'يَسْتَطِيعُ',
  'تستطيع': 'تَسْتَطِيعُ',
  'يمكن': 'يُمْكِنُ',
  'يجب': 'يَجِبُ',
  'ينبغي': 'يَنْبَغِي',
  'يوجد': 'يُوجَدُ',
  'توجد': 'تُوجَدُ',
  'يعد': 'يُعَدُّ',
  'تعد': 'تُعَدُّ',
  'يعتبر': 'يُعْتَبَرُ',
  'تعتبر': 'تُعْتَبَرُ',
  'يتميز': 'يَتَمَيَّزُ',
  'تتميز': 'تَتَمَيَّزُ',
  'يساعد': 'يُسَاعِدُ',
  'تساعد': 'تُسَاعِدُ',
  'يقدم': 'يُقَدِّمُ',
  'تقدم': 'تُقَدِّمُ',
  'يعبر': 'يُعَبِّرُ',
  'تعبر': 'تُعَبِّرُ',
  'يحقق': 'يُحَقِّقُ',
  'تحقق': 'تُحَقِّقُ',
  'يحتاج': 'يَحْتَاجُ',
  'تحتاج': 'تَحْتَاجُ',
  'يسمح': 'يَسْمَحُ',
  'تسمح': 'تَسْمَحُ',
  'يتيح': 'يُتِيحُ',
  'تتيح': 'تُتِيحُ',
  'يدعم': 'يَدْعَمُ',
  'تدعم': 'تَدْعَمُ',
  'يعتمد': 'يَعْتَمِدُ',
  'تعتمد': 'تَعْتَمِدُ',
  'يسهل': 'يُسَهِّلُ',
  'تسهل': 'تُسَهِّلُ',
  'يسهم': 'يُسْهِمُ',
  'تسهم': 'تُسْهِمُ',
  'وسعت': 'وَسِعَتْ',
  'ضاقت': 'ضَاقَتْ',
  'يسألون': 'يَسْأَلُونَ',
  'أفلا': 'أَفَلَا',
  'تعقلون': 'تَعْقِلُونَ',
  'تتدبرون': 'تَتَدَبَّرُونَ',

  // High-frequency Nouns, Adjectives & Cultural/Technical Lexicon
  'الله': 'اللَّهُ',
  'بسم': 'بِسْمِ',
  'الرحمن': 'الرَّحْمَنِ',
  'الرحيم': 'الرَّحِيمِ',
  'الحمد': 'الْحَمْدُ',
  'رب': 'رَبِّ',
  'العالمين': 'الْعَالَمِينَ',
  'السلام': 'السَّلَامُ',
  'رحمة': 'رَحْمَةُ',
  'اللغة': 'اللُّغَةُ',
  'لغة': 'لُغَةٌ',
  'العربية': 'الْعَرَبِيَّةُ',
  'عربية': 'عَرَبِيَّةٌ',
  'العربي': 'الْعَرَبِيُّ',
  'عربي': 'عَرَبِيٌّ',
  'العرب': 'الْعَرَبُ',
  'النص': 'النَّصُّ',
  'نص': 'نَصٌّ',
  'النصوص': 'النُّصُوصُ',
  'نصوص': 'نُصُوصٌ',
  'الكلمة': 'الْكَلِمَةُ',
  'كلمة': 'كَلِمَةٌ',
  'الكلمات': 'الْكَلِمَاتُ',
  'كلمات': 'كَلِمَاتٌ',
  'الحرف': 'الْحَرْفُ',
  'حرف': 'حَرْفٌ',
  'الحروف': 'الْحُرُوفُ',
  'حروف': 'حُرُوفٌ',
  'الأحرف': 'الْأَحْرُفُ',
  'التشكيل': 'التَّشْكِيلُ',
  'تشكيل': 'تَشْكِيلُ',
  'التنسيق': 'التَّنْسِيقُ',
  'تنسيق': 'تَنْسِيقُ',
  'الحركة': 'الْحَرَكَةُ',
  'حركة': 'حَرَكَةٌ',
  'الحركات': 'الْحَرَكَاتُ',
  'حركات': 'حَرَكَاتٌ',
  'المعنى': 'الْمَعْنَى',
  'معنى': 'مَعْنًى',
  'المعاني': 'الْمَعَانِي',
  'القراءة': 'الْقِرَاءَةُ',
  'قراءة': 'قِرَاءَةٌ',
  'الكتابة': 'الْكِتَابَةُ',
  'كتابة': 'كِتَابَةٌ',
  'البيان': 'الْبَيَانُ',
  'بيان': 'بَيَانٌ',
  'البلاغة': 'الْبَلَاغَةُ',
  'الأدب': 'الْأَدَبُ',
  'الشعر': 'الشِّعْرُ',
  'النثر': 'النَّثْرُ',
  'العلم': 'الْعِلْمُ',
  'العلوم': 'الْعُلُومُ',
  'المعرفة': 'الْمَعْرِفَةُ',
  'معرفة': 'مَعْرِفَةٌ',
  'الحكمة': 'الْحِكْمَةُ',
  'حكمة': 'حِكْمَةٌ',
  'الفكر': 'الْفِكْرُ',
  'فكر': 'فِكْرٌ',
  'الإنسان': 'الْإِنْسَانُ',
  'إنسان': 'إِنْسَانٌ',
  'الناس': 'النَّاسُ',
  'الحياة': 'الْحَيَاةُ',
  'حياة': 'حَيَاةٌ',
  'العالم': 'الْعَالَمُ',
  'الوقت': 'الْوَقْتُ',
  'وقت': 'وَقْتٌ',
  'الزمان': 'الزَّمَانُ',
  'المكان': 'الْمَكَانُ',
  'اليوم': 'الْيَوْمَ',
  'يوم': 'يَوْمٌ',
  'الأرض': 'الْأَرْضُ',
  'السماء': 'السَّمَاءُ',
  'الشمس': 'الشَّمْسُ',
  'القمر': 'الْقَمَرُ',
  'النور': 'النُّورُ',
  'نور': 'نُورٌ',
  'الجمال': 'الْجَمَالُ',
  'جمال': 'جَمَالٌ',
  'الخير': 'الْخَيْرُ',
  'الحق': 'الْحَقُّ',
  'الصدق': 'الصِّدْقُ',
  'الأمل': 'الْأَمَلُ',
  'العمل': 'الْعَمَلُ',
  'النجاح': 'النَّجَاحُ',
  'التعلم': 'التَّعَلُّمُ',
  'التعليم': 'التَّعْلِيمُ',
  'التقنية': 'التِّقْنِيَّةُ',
  'تقنية': 'تِقْنِيَّةٌ',
  'التطبيق': 'التَّطْبِيقُ',
  'تطبيق': 'تَطْبِيقٌ',
  'التطبيقات': 'التَّطْبِيقَاتُ',
  'التصميم': 'التَّصْمِيمُ',
  'الواجهة': 'الْوَاجِهَةُ',
  'المستخدم': 'الْمُسْتَخْدِمُ',
  'المستخدمين': 'الْمُسْتَخْدِمِينَ',
  'الهاتف': 'الْهَاتِفُ',
  'الهواتف': 'الْهَوَاتِفِ',
  'المتصفح': 'الْمُتَصَفِّحُ',
  'المتصفحات': 'الْمُتَصَفِّحَاتِ',
  'السرعة': 'السُّرْعَةُ',
  'الأداء': 'الْأَدَاءُ',
  'الدقة': 'الدِّقَّةُ',
  'الوضوح': 'الْوُضُوحُ',
  'النظام': 'النِّظَامُ',
  'البيانات': 'الْبَيَانَاتُ',
  'المعلومات': 'الْمَعْلُومَاتُ',
  'البرمجة': 'الْبَرْمَجَةُ',
  'المحتوى': 'الْمُحْتَوَى',
  'الجودة': 'الْجَوْدَةُ',
  'الكتاب': 'الْكِتَابُ',
  'كتاب': 'كِتَابٌ',
  'التاريخ': 'التَّارِيخُ',
  'الحضارة': 'الْحَضَارَةُ',
  'الثقافة': 'الثَّقَافَةُ',
  'التراث': 'التُّرَاثُ',
  'المجتمع': 'الْمُجْتَمَعُ',
  'الوطن': 'الْوَطَنُ',
  'البحر': 'الْبَحْرُ',
  'بحر': 'بَحْرٌ',
  'الدر': 'الدُّرُّ',
  'كامن': 'كَامِنٌ',
  'صدفاته': 'صَدَفَاتِهِ',
  'أحشائه': 'أَحْشَائِهِ',
  'غواص': 'غَوَّاصٌ',
  'لفظا': 'لَفْظًا',
  'وغاية': 'وَغَايَةً',
  'آي': 'آيٍ',
  'عظات': 'عِظَاتٍ',
  'وصف': 'وَصْفِ',
  'آلة': 'آلَةٍ',
  'أسماء': 'أَسْمَاءٍ',
  'لمخترعات': 'لِمُخْتَرَعَاتٍ',
  'علامات': 'عَلَامَاتِ',
  'الترقيم': 'التَّرْقِيمِ',
  'الفاصلة': 'الْفَاصِلَةِ',
  'النقطة': 'النُّقْطَةِ',
  'الهمزة': 'الْهَمْزَةِ',
  'الهمزات': 'الْهَمَزَاتِ',
  'التاء': 'التَّاءِ',
  'المربوطة': 'الْمَرْبُوطَةِ',
  'الهاء': 'الْهَاءِ',
  'المسافات': 'الْمَسَافَاتِ',
  'الزائدة': 'الزَّائِدَةِ',
  'السطور': 'السُّطُورِ',
  'الفارغة': 'الْفَارِغَةِ',
  'الحديثة': 'الْحَدِيثَةِ',
  'الذكية': 'الذَّكِيَّةِ',
  'المحمولة': 'الْمَحْمُولَةِ',
  'الاحترافي': 'الِاحْتِرَافِيُّ',
  'الاحترافية': 'الِاحْتِرَافِيَّةُ',
  'المتكامل': 'الْمُتَكَامِلُ',
  'المتقدم': 'الْمُتَقَدِّمُ',
  'السريع': 'السَّرِيعُ',
  'الدقيق': 'الدَّقِيقُ',
  'الواضح': 'الْوَاضِحُ',
  'البسيط': 'الْبَسِيطُ',
  'النظيف': 'النَّظِيفُ',
  'أدوات': 'أَدَوَاتُ',
  'أداة': 'أَدَاةٌ',
  'خيارات': 'خِيَارَاتُ',
  'ميزة': 'مِيزَةٌ',
  'ميزات': 'مِيزَاتُ',
  'مزايا': 'مَزَايَا',
  'تجربة': 'تَجْرِبَةُ',
  'سلسة': 'سَلِسَةٌ',
  'فعالة': 'فَعَّالَةٌ',
  'كفاءة': 'كَفَاءَةٍ',
  'عالية': 'عَالِيَةٍ',
  'جديد': 'جَدِيدٌ',
  'جديدة': 'جَدِيدَةٌ',
  'كبير': 'كَبِيرٌ',
  'كبيرة': 'كَبِيرَةٌ',
  'صغير': 'صَغِيرٌ',
  'صغيرة': 'صَغِيرَةٌ',
  'جميل': 'جَمِيلٌ',
  'جميلة': 'جَمِيلَةٌ',
  'مهم': 'مُهِمٌّ',
  'مهمة': 'مُهِمَّةٌ',
  'سهل': 'سَهْلٌ',
  'سهلة': 'سَهْلَةٌ',
  'حديث': 'حَدِيثٌ',
  'حديثة': 'حَدِيثَةٌ',
  'متنوعة': 'مُتَنَوِّعَةٌ',
  'مختلفة': 'مُخْتَلِفَةٌ',
  'أساسي': 'أَسَاسِيٌّ',
  'أساسية': 'أَسَاسِيَّةٌ',
  'أول': 'أَوَّلُ',
  'ثاني': 'ثَانِي',
  'ثالث': 'ثَالِثُ',
  'واحد': 'وَاحِدٌ',
  'واحدة': 'وَاحِدَةٌ',
  'أهلا': 'أَهْلًا',
  'سهلا': 'سَهْلًا',
  'مرحبا': 'مَرْحَبًا',
  'شكرا': 'شُكْرًا',
  'جزيلا': 'جَزِيلًا',
  'دائما': 'دَائِمًا',
  'أيضا': 'أَيْضًا',
  'جدا': 'جِدًّا',
  'فقط': 'فَقَطْ',
  'معا': 'مَعًا',
  'حقا': 'حَقًّا',
  'خاصة': 'خَاصَّةً',
  'عامة': 'عَامَّةً',
  'محليا': 'مَحَلِّيًّا',
  'يدويا': 'يَدَوِيًّا',
  'فوريا': 'فَوْرِيًّا',
  'مباشرة': 'مُبَاشَرَةً',
  'سواء': 'سَوَاءً',
  'الذات': 'الذَّاتِ',
  'الضاد': 'الضَّادِ',
  'البيانِ': 'الْبَيَانِ',
  'التعبير': 'التَّعْبِيرُ',
  'التواصل': 'التَّوَاصُلُ',
  'الحوار': 'الْحِوَارُ',
  'الأسلوب': 'الْأُسْلُوبُ',
  'الصوت': 'الصَّوْتُ',
  'الضبط': 'الضَّبْطُ',
  'النحو': 'النَّحْوُ',
  'الصرف': 'الصَّرْفُ',
  'الإملاء': 'الْإِمْلَاءُ',
  'الخط': 'الْخَطُّ',
  'النسخ': 'النَّسْخُ',
  'الرقعة': 'الرُّقْعَةُ',
  'الديواني': 'الدِّيوَانِيُّ',
  'الثلث': 'الثُّلُثُ',
  'الكوفي': 'الْكُوفِيُّ',
  'الجمهور': 'الْجُمْهُورُ',
  'القارئ': 'الْقَارِئُ',
  'الكاتب': 'الْكَاتِبُ',
  'المطور': 'الْمُطَوِّرُ',
  'المبرمج': 'الْمُبَرْمِجُ',
  'المصمم': 'الْمُصَمِّمُ',
  'الباحث': 'الْبَاحِثُ',
  'الطالب': 'الطَّالِبُ',
  'المعلم': 'الْمُعَلِّمُ',
  'الأستاذ': 'الْأُسْتَاذُ',
  'انا': 'أَنَا',
  'احشائه': 'أَحْشَائِهِ',
  'صدفاتي': 'صَدَفَاتِي',
  'سألوا': 'سَأَلُوا',
  'الغواص': 'الْغَوَّاصَ',
  'ضقت': 'ضِقْتُ',
  'اجمل': 'أَجْمَلِ',
  'اللغات': 'اللُّغَاتِ',
  'اضافة': 'إِضَافَةِ',
  'ازالة': 'إِزَالَةِ',
  'يمتاز': 'يَمْتَازُ',
  'الصحيح': 'الصَّحِيحِ',
  'بسهولة': 'بِسُهُولَةٍ',
  'والصلاة': 'وَالصَّلَاةُ',
  'اشرف': 'أَشْرَفِ',
  'المرسلين': 'الْمُرْسَلِينَ',
  'الرقمي': 'الرَّقْمِيِّ',
  'بجودة': 'بِجَوْدَةٍ',
};

/**
 * Strips all Arabic diacritic marks from a string.
 */
export function stripDiacritics(text: string): string {
  return text.replace(DIACRITIC_REGEX, '');
}

/**
 * Counts words, total characters, characters without diacritics, diacritic marks, and lines.
 */
export function analyzeArabicText(text: string): TextStats {
  if (!text) {
    return {
      words: 0,
      charsWithDiacritics: 0,
      charsWithoutDiacritics: 0,
      diacriticMarks: 0,
      lines: 0,
    };
  }

  const withoutDiacritics = stripDiacritics(text);
  const diacriticMatches = text.match(DIACRITIC_REGEX);
  const trimmed = withoutDiacritics.trim();
  const words = trimmed ? trimmed.split(/\s+/).filter((w) => /\S/.test(w)).length : 0;
  const lines = text.length === 0 ? 0 : text.split(/\r\n|\r|\n/).length;

  return {
    words,
    charsWithDiacritics: text.length,
    charsWithoutDiacritics: withoutDiacritics.length,
    diacriticMarks: diacriticMatches ? diacriticMatches.length : 0,
    lines,
  };
}

/**
 * Applies morphological and heuristic Arabic diacritization to a single base word
 * when it is not found directly in the curated lexicon.
 */
function diacritizeUnknownWord(baseWord: string): string {
  if (baseWord.length < 2) {
    return baseWord;
  }

  // Handle definite article "ال"
  if (baseWord.startsWith('ال') && baseWord.length >= 4) {
    const rest = baseWord.slice(2);
    const firstOfRest = rest[0];
    const vocalizedRest = diacritizeStem(rest);
    if (SUN_LETTERS.has(firstOfRest)) {
      // Sun letter: add Shadda to the first letter of the stem (if not already present)
      const restChars = Array.from(vocalizedRest);
      const firstBase = restChars[0];
      const existingMarks = restChars.slice(1).join('');
      const hasShadda = existingMarks.includes(HARAKAT.SHADDA);
      // Reconstruct carefully by finding first cluster
      const clusters = segmentArabicClusters(vocalizedRest);
      if (clusters.length > 0) {
        if (!clusters[0].diacritics.includes(HARAKAT.SHADDA)) {
          clusters[0].diacritics = HARAKAT.SHADDA + (clusters[0].diacritics || HARAKAT.FATHA);
        }
        return 'ال' + clustersToString(clusters);
      }
      return 'ال' + firstBase + (hasShadda ? '' : HARAKAT.SHADDA) + existingMarks;
    } else {
      // Moon letter: Sukun on Lam
      return 'ال' + HARAKAT.SUKUN + vocalizedRest;
    }
  }

  return diacritizeStem(baseWord);
}

/**
 * Pattern-based Arabic morphological vocalizer for stems.
 */
function diacritizeStem(stem: string): string {
  const len = stem.length;

  // Pattern: تَفْعِيل (5 chars: ت + C1 + C2 + ي + C3) e.g. تنسيق, تشكيل, تطوير
  if (
    len === 5 &&
    stem[0] === 'ت' &&
    stem[3] === 'ي' &&
    !['ا', 'و', 'ي', 'ى'].includes(stem[1]) &&
    !['ا', 'ى'].includes(stem[2])
  ) {
    return (
      stem[0] + HARAKAT.FATHA +
      stem[1] + HARAKAT.SUKUN +
      stem[2] + HARAKAT.KASRA +
      stem[3] +
      stem[4]
    );
  }

  // Pattern: تَفْعِلَة (5 chars: ت + C1 + C2 + ة) - wait length 5: ت + C1 + C2 + C3 + ة
  if (
    len === 5 &&
    stem[0] === 'ت' &&
    stem[4] === 'ة' &&
    !['ا', 'و', 'ي'].includes(stem[1])
  ) {
    return (
      stem[0] + HARAKAT.FATHA +
      stem[1] + HARAKAT.SUKUN +
      stem[2] + HARAKAT.KASRA +
      stem[3] + HARAKAT.FATHA +
      stem[4] + HARAKAT.DAMMATAN
    );
  }

  // Pattern: اسْتِفْعَال (7 chars: ا + س + ت + C1 + C2 + ا + C3)
  if (len === 7 && stem.startsWith('است') && stem[5] === 'ا') {
    return (
      'ا' +
      'س' + HARAKAT.SUKUN +
      'ت' + HARAKAT.KASRA +
      stem[3] + HARAKAT.SUKUN +
      stem[4] + HARAKAT.FATHA +
      'ا' +
      stem[6]
    );
  }

  // Pattern: فَاعِل (4 chars: C1 + ا + C2 + C3) e.g. كاتب, قارئ, واضح
  if (
    len === 4 &&
    stem[1] === 'ا' &&
    !['ا', 'و', 'ي', 'ى'].includes(stem[0]) &&
    !['ا', 'و', 'ي', 'ى', 'ة'].includes(stem[2]) &&
    !['ا', 'و', 'ي', 'ى'].includes(stem[3])
  ) {
    return (
      stem[0] + HARAKAT.FATHA +
      'ا' +
      stem[2] + HARAKAT.KASRA +
      stem[3]
    );
  }

  // Pattern: فَاعِلَة (5 chars: C1 + ا + C2 + C3 + ة)
  if (
    len === 5 &&
    stem[1] === 'ا' &&
    stem[4] === 'ة' &&
    !['ا', 'و', 'ي', 'ى'].includes(stem[0])
  ) {
    return (
      stem[0] + HARAKAT.FATHA +
      'ا' +
      stem[2] + HARAKAT.KASRA +
      stem[3] + HARAKAT.FATHA +
      'ة'
    );
  }

  // Pattern: مَفْعُول (5 chars: م + C1 + C2 + و + C3) e.g. مكتوب, مفهوم
  if (
    len === 5 &&
    stem[0] === 'م' &&
    stem[3] === 'و' &&
    !['ا', 'و', 'ي'].includes(stem[1]) &&
    !['ا', 'و', 'ي'].includes(stem[2])
  ) {
    return (
      'م' + HARAKAT.FATHA +
      stem[1] + HARAKAT.SUKUN +
      stem[2] + HARAKAT.DAMMA +
      'و' +
      stem[4]
    );
  }

  // Pattern: تَفَاعُل (5 chars: ت + C1 + ا + C2 + C3) e.g. تعاون, توازن, تكامل
  if (
    len === 5 &&
    stem[0] === 'ت' &&
    stem[2] === 'ا' &&
    !['ا', 'و', 'ي'].includes(stem[1]) &&
    !['ا', 'و', 'ي', 'ة'].includes(stem[4])
  ) {
    return (
      'ت' + HARAKAT.FATHA +
      stem[1] + HARAKAT.FATHA +
      'ا' +
      stem[3] + HARAKAT.DAMMA +
      stem[4]
    );
  }

  // General vowel-aware fallback: mark consonants preceding long vowels ا/و/ي and ة
  let result = '';
  const chars = Array.from(stem);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const next = chars[i + 1];
    result += ch;

    const isLongVowel = ch === 'ا' || ch === 'ى' || ch === 'آ' || ch === 'أ' || ch === 'إ';
    if (!ARABIC_LETTER_REGEX.test(ch)) {
      continue;
    }

    if (ch === 'أ') {
      result += HARAKAT.FATHA;
    } else if (ch === 'إ') {
      result += HARAKAT.KASRA;
    } else if (ch === 'ا' || ch === 'ى' || ch === 'آ') {
      // Never put harakat on pure Alif / Alif Maqsura / Maddah
    } else if (ch === 'ة') {
      // Leave Teh Marbuta open or subtle unless in full lexicon
    } else if (ch === 'و' && next === 'ا' && i === chars.length - 2) {
      // Do not put Fatha on plural Waw before Alif al-Fariqah (e.g. كتبوا)
    } else if (next === 'ا' || next === 'ى') {
      result += HARAKAT.FATHA;
    } else if (next === 'ي' && i < chars.length - 2) {
      result += HARAKAT.KASRA;
    } else if (next === 'و' && i < chars.length - 2) {
      result += HARAKAT.DAMMA;
    } else if (next === 'ة') {
      result += HARAKAT.FATHA;
    }
  }
  return result;
}

/**
 * Diacritizes a single bare Arabic word using lexicon + prefix resolution + rules.
 */
function diacritizeSingleWord(rawWord: string, mode: DiacritizationMode): string {
  if (mode === 'none') {
    return stripDiacritics(rawWord);
  }

  const base = stripDiacritics(rawWord);
  if (!base || !ARABIC_LETTER_REGEX.test(base)) {
    return rawWord;
  }

  let fullForm = ARABIC_LEXICON[base];

  if (!fullForm) {
    // Try single-letter prefixes: و، ف، ب، ك، ل
    const prefix = base[0];
    const rest = base.slice(1);

    if (rest.length >= 2) {
      if ((prefix === 'و' || prefix === 'ف' || prefix === 'ك') && ARABIC_LEXICON[rest]) {
        const prefixVocalized = prefix + HARAKAT.FATHA;
        fullForm = prefixVocalized + ARABIC_LEXICON[rest];
      } else if (prefix === 'ب' && ARABIC_LEXICON[rest]) {
        fullForm = 'ب' + HARAKAT.KASRA + ARABIC_LEXICON[rest];
      } else if (prefix === 'ل' && rest.startsWith('ل') && ARABIC_LEXICON['ا' + rest]) {
        // e.g., للغة (ل + اللغة) -> لِلُّغَةِ
        const inner = ARABIC_LEXICON['ا' + rest].slice(1); // drop leading ا
        fullForm = 'ل' + HARAKAT.KASRA + inner;
      } else if (prefix === 'ل' && ARABIC_LEXICON[rest]) {
        fullForm = 'ل' + HARAKAT.KASRA + ARABIC_LEXICON[rest];
      } else if ((prefix === 'و' || prefix === 'ف') && rest.startsWith('ال') && rest.length >= 4) {
        fullForm = prefix + HARAKAT.FATHA + diacritizeUnknownWord(rest);
      } else if (prefix === 'ب' && rest.startsWith('ال') && rest.length >= 4) {
        fullForm = 'ب' + HARAKAT.KASRA + diacritizeUnknownWord(rest);
      } else if (prefix === 'ل' && rest.startsWith('ل') && rest.length >= 3) {
        // لل + stem -> لِلْ...
        const stem = rest.slice(1);
        const firstStem = stem[0];
        const stemVocalized = diacritizeStem(stem);
        if (SUN_LETTERS.has(firstStem)) {
          const clusters = segmentArabicClusters(stemVocalized);
          if (clusters.length > 0 && !clusters[0].diacritics.includes(HARAKAT.SHADDA)) {
            clusters[0].diacritics = HARAKAT.SHADDA + (clusters[0].diacritics || HARAKAT.FATHA);
          }
          fullForm = 'ل' + HARAKAT.KASRA + 'ل' + clustersToString(clusters);
        } else {
          fullForm = 'ل' + HARAKAT.KASRA + 'ل' + HARAKAT.SUKUN + stemVocalized;
        }
      }
    }
  }

  if (!fullForm) {
    fullForm = diacritizeUnknownWord(base);
  }

  if (mode === 'partial') {
    return toPartialDiacritics(fullForm);
  }

  return fullForm;
}

/**
 * Converts a fully diacritized word into partial (minimal editorial) diacritization:
 * Keeps Shadda, Tanween, and final ending mark, plus keeps marks on 2-3 letter ambiguous words.
 */
function toPartialDiacritics(vocalizedWord: string): string {
  const clusters = segmentArabicClusters(vocalizedWord);
  const arabicIndices = clusters
    .map((c, idx) => (c.isArabicLetter ? idx : -1))
    .filter((idx) => idx !== -1);

  if (arabicIndices.length === 0) return vocalizedWord;

  const isShortWord = arabicIndices.length <= 3;
  const lastArabicIdx = arabicIndices[arabicIndices.length - 1];

  return clusters
    .map((cluster, idx) => {
      if (!cluster.isArabicLetter || !cluster.diacritics) {
        return cluster.base + cluster.diacritics;
      }
      if (isShortWord) {
        // Remove pure sukun on short words unless needed, keep vowels
        const cleaned = cluster.diacritics.replace(HARAKAT.SUKUN, '');
        return cluster.base + cleaned;
      }
      // Keep Shadda, Tanween, and final inflection mark
      let kept = '';
      if (cluster.diacritics.includes(HARAKAT.SHADDA)) {
        kept += HARAKAT.SHADDA;
      }
      const tanween = [HARAKAT.FATHATAN, HARAKAT.DAMMATAN, HARAKAT.KASRATAN].find((t) =>
        cluster.diacritics.includes(t)
      );
      if (tanween) {
        kept += tanween;
      } else if (idx === lastArabicIdx) {
        const lastVowel = [HARAKAT.FATHA, HARAKAT.DAMMA, HARAKAT.KASRA, HARAKAT.SUKUN].find((v) =>
          cluster.diacritics.includes(v)
        );
        if (lastVowel) kept += lastVowel;
      }
      return cluster.base + kept;
    })
    .join('');
}

/**
 * Diacritizes an entire Arabic text while preserving whitespace and punctuation.
 */
export function diacritizeArabicText(text: string, mode: DiacritizationMode): string {
  if (!text) return '';
  if (mode === 'none') return stripDiacritics(text);

  // Split into Arabic letter+diacritic tokens vs everything else
  const tokenRegex = /([\u0621-\u064A\u064B-\u065F\u066E-\u066F\u0670-\u06D3]+)/g;
  return text.replace(tokenRegex, (token) => diacritizeSingleWord(token, mode));
}

/**
 * Closed-class words, prepositional pronoun compounds, and root-Haa nouns/verbs
 * whose final letter is genuinely Haa (`ه`), never Taa Marbuta (`ة`).
 */
const TRUE_HAA_WORDS = new Set([
  'هذه', 'هذي', 'الله', 'إله', 'اله', 'له', 'به', 'عنه', 'منه', 'فيه', 'إليه', 'اليه',
  'عليه', 'معه', 'عنده', 'لديه', 'تجاه', 'إياه', 'اياه', 'لأنه', 'لانه', 'كأنه', 'كانه',
  'أنه', 'انه', 'إنه', 'فوقه', 'تحته', 'أمامه', 'امامه', 'وراءه', 'خلفه', 'بينه', 'حوله',
  'خلاله', 'نحوه', 'وجه', 'شبه', 'فقه', 'كره', 'تفه', 'مياه', 'شفاه', 'أفواه', 'افواه',
  'نزه', 'تنزه', 'انتبه', 'توجه', 'توجيه', 'تنبيه', 'تشبيه', 'ترفيه', 'تأليه', 'اشتبه',
  'تشبه', 'منبه', 'مشتبه', 'متشابه', 'مكروه', 'مشبوه', 'معتوه', 'سفيه', 'نزيه', 'نبيه',
  'وجيه', 'بديه', 'فقيه', 'شبيه', 'يديه', 'قدميه', 'عينيه', 'أبويه', 'ابويه', 'والديه',
  'جانبيه', 'طرفيه', 'أذنيه', 'اذنيه', 'رجليه', 'كتفيه', 'قلمه', 'بيته', 'اسمه', 'حقه',
  'رأيه', 'رايه', 'دوره', 'موقعه', 'لونه', 'شكله', 'حجمه', 'سعره', 'رقمه', 'صوته',
  'وجهه', 'أهله', 'اهله', 'ابنه', 'أخوه', 'اخوه', 'أبوه', 'ابوه', 'نفسه', 'ذاته',
  'بعضه', 'كله', 'جميعه', 'معظمه', 'غيره', 'مثله', 'احشائه', 'أحشائه', 'أخذه', 'اخذه',
  'وضعه', 'قرأه', 'قراه', 'كتبه', 'شاهده', 'وجده', 'أعطاه', 'اعطاه', 'سأله', 'ساله',
  'رآه', 'راه', 'فعلته', 'توقعه', 'سلوكه', 'مصدره', 'هدفه', 'أسلوبه', 'اسلوبه',
]);

/**
 * Common feminine nouns, adjectives, and verbal nouns whose standard ending is Taa Marbuta (`ة`).
 */
const FEMININE_TEH_WORDS = new Set([
  'لغة', 'مدرسة', 'جامعة', 'حديقة', 'مدينة', 'دولة', 'شركة', 'فكرة', 'طريقة', 'مرحلة',
  'مشكلة', 'نتيجة', 'خدمة', 'ميزة', 'رسالة', 'قصة', 'جملة', 'كلمة', 'صورة', 'ورقة',
  'ساعة', 'دقيقة', 'ثانية', 'مكتبة', 'وزارة', 'إدارة', 'ادارة', 'حكومة', 'معرفة', 'ثقافة',
  'حضارة', 'صناعة', 'زراعة', 'تجارة', 'سياسة', 'رياضة', 'صحة', 'بيئة', 'طاقة', 'حرية',
  'عدالة', 'قوة', 'قدرة', 'رغبة', 'حاجة', 'فرصة', 'لحظة', 'نظرة', 'خطوة', 'تجربة',
  'مهمة', 'وظيفة', 'علاقة', 'حقيقة', 'قيمة', 'درجة', 'نسبة', 'فترة', 'مدة', 'خطة',
  'نسخة', 'صفحة', 'شاشة', 'لوحة', 'أداة', 'اداة', 'قناة', 'حياة', 'صلاة', 'زكاة',
  'فتاة', 'مرآة', 'مراة', 'بداية', 'نهاية', 'حكاية', 'رواية', 'دراية', 'رعاية', 'وقاية',
  'هداية', 'عناية', 'راية', 'آية', 'اية', 'غاية', 'عربية', 'إسلامية', 'اسلامية', 'تقنية',
  'علمية', 'أدبية', 'ادبية', 'تاريخية', 'أساسية', 'اساسية', 'عملية', 'يومية', 'حقيقية',
  'احترافية', 'حديثة', 'قديمة', 'جميلة', 'كبيرة', 'صغيرة', 'كثيرة', 'قليلة', 'جديدة',
  'مفيدة', 'سريعة', 'دقيقة', 'سهلة', 'واضحة', 'رائعة', 'ممتازة', 'متكاملة', 'متقدمة',
  'فعالة', 'قوية', 'ذكية', 'سلسة', 'خاصة', 'عامة', 'عالية', 'ثلاثة', 'أربعة', 'اربعة',
  'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'مائة', 'مئة', 'قراءة', 'جودة',
  'كفاءة', 'واجهة', 'سرعة', 'نقطة', 'فاصلة', 'همزة', 'حركة', 'زائدة', 'فارغة', 'محمولة',
  'ذكية', 'متنوعة', 'مختلفة', 'إضافة', 'اضافة', 'إزالة', 'ازالة', 'مراجعة', 'معالجة',
  'مشاركة', 'متابعة', 'مقارنة', 'صياغة', 'طباعة', 'إشارة', 'اشارة', 'عبارة', 'مهارة',
]);

/**
 * Ambiguous noun stems that legitimately take either `-ه` (possessive pronoun "his")
 * or `-ة` (distinct feminine noun/masdar) depending on adjacent syntactic context.
 */
const AMBIGUOUS_TEH_HAA_STEMS = new Set([
  'كتاب', 'عمل', 'علم', 'حكم', 'عمر', 'سن', 'مكتب', 'وجه', 'شبه', 'من', 'علي',
]);

const POSSESSIVE_PRECEDING_VERBS = new Set([
  'قرأ', 'قرا', 'أخذ', 'اخذ', 'فتح', 'أغلق', 'اغلق', 'حمل', 'نسي', 'فقد', 'أنهى', 'انهى',
  'أكمل', 'اكمل', 'بدأ', 'بدا', 'كتب', 'نشر', 'راجع', 'أعد', 'اعد', 'قدم', 'أطلق', 'اطلق',
  'ترك', 'وجد', 'باع', 'اشترى', 'أعطى', 'اعطى', 'سمع', 'شاهد', 'رأى', 'راى', 'عرف', 'فهم',
]);

const MASCULINE_FOLLOWING_MODIFIERS = new Set([
  'الجديد', 'القديم', 'المفيد', 'الجميل', 'الكبير', 'الصغير', 'الأول', 'الاول',
  'الأخير', 'الاخير', 'الخاص', 'العام', 'الشخصي', 'الكامل', 'الرائع', 'الممتاز',
  'الوحيد', 'التالي', 'السابق', 'الأصلي', 'الاصل', 'هذا', 'ذاك', 'الذي', 'عشرون', 'ثلاثون',
]);

const FEMININE_PRECEDING_CUES = new Set([
  'هذه', 'هذة', 'تلك', 'أية', 'اية', 'عدة', 'كل', 'بعض', 'نفس', 'ذات', 'أول', 'اول',
]);

/**
 * Standardizes the different forms of Arabic Hamza (`أ`, `إ`, `آ`, `ٱ`, `ؤ`, `ئ`)
 * according to the configured {@link HamzaStandardizationMode}.
 */
export function standardizeHamza(text: string, mode: HamzaStandardizationMode): string {
  if (!text || mode === 'none') {
    return text;
  }

  switch (mode) {
    case 'alef_only':
      return text.replace(/[أإآٱ]/g, 'ا');
    case 'all_to_alef':
      return text.replace(/[أإآٱؤئ]/g, 'ا');
    case 'all_to_hamza':
      return text.replace(/[أإآٱؤئ]/g, 'ء');
    default:
      return text;
  }
}

/**
 * Strips single-letter Arabic proclitic prefixes (`و`, `ف`, `ب`, `ك`, `ل`) when looking up
 * base stems in lexical sets, returning the stripped stem and prefix info.
 */
function stripProcliticForLookup(bareWord: string): { prefix: string; stem: string } {
  if (bareWord.length >= 3 && ['و', 'ف', 'ب', 'ك', 'ل'].includes(bareWord[0])) {
    // Handle `ل` + `ل...` (as in للغة = ل + اللغة)
    if (bareWord[0] === 'ل' && bareWord[1] === 'ل' && bareWord.length >= 4) {
      return { prefix: 'ل', stem: 'ا' + bareWord.slice(1) };
    }
    return { prefix: bareWord[0], stem: bareWord.slice(1) };
  }
  return { prefix: '', stem: bareWord };
}

/**
 * Replaces the final Arabic base letter (`ة` or `ه`) in a vocalized token while preserving
 * any attached diacritics on that final letter and throughout the rest of the word.
 */
function replaceFinalBaseLetter(token: string, targetLetter: 'ة' | 'ه'): string {
  const clusters = segmentArabicClusters(token);
  for (let i = clusters.length - 1; i >= 0; i--) {
    if (clusters[i].isArabicLetter) {
      if (clusters[i].base === 'ة' || clusters[i].base === 'ه') {
        clusters[i].base = targetLetter;
      }
      break;
    }
  }
  return clustersToString(clusters);
}

/**
 * Intelligently differentiates between final Taa Marbuta (`ة`) and final Haa (`ه`)
 * based on Arabic morphological structure, closed-class pronoun/particle rules,
 * definite-article constraints, and adjacent syntactic context.
 *
 * Key linguistic rules applied:
 * 1. Closed-class true-Haa words (`هذه`, `الله`, `له`, `به`, `فيه`, `عليه`, `مياه`, `وجه`, etc.)
 *    are corrected to `ه` if mistakenly written with `ة` (except contextual `منة الله` / `العلية`).
 * 2. Words with definite prefix `ال` (`المدرسه`, `الكتابه`) cannot take the possessive suffix `-ه`,
 *    so any `ال...ه` not belonging to the true-Haa root set is corrected to `ة`.
 * 3. Ambiguous stems (`كتابه`/`كتابة`, `عمله`/`عملة`, `علمه`/`علمة`, `حكمه`/`حكمة`) resolve via
 *    preceding verbs/cues (`قرأ كتابه` -> `ه`, `هذه كتابة` -> `ة`) and following modifiers
 *    (`كتابه الجديد` -> `ه`, `كتابة جميلة` -> `ة`).
 * 4. Known feminine nouns, Nisba adjectives (`...ية`), and adjacent feminine agreement pairs
 *    (`مدرسه كبيره` -> `مدرسة كبيرة`) resolve to `ة`.
 */
export function smartDifferentiateTehAndHaa(text: string): string {
  if (!text) return '';

  // Tokenize into Arabic word tokens vs separators so we can inspect neighboring words
  const parts = text.split(/([\u0621-\u064A\u064B-\u065F\u066E-\u066F\u0670-\u06D3]+)/g);

  // Extract indices of Arabic word tokens for adjacent context lookup
  const wordIndices: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1 && parts[i].length > 0) {
      wordIndices.push(i);
    }
  }

  const bareAt = (wordPos: number): string => {
    if (wordPos < 0 || wordPos >= wordIndices.length) return '';
    return stripDiacritics(parts[wordIndices[wordPos]]);
  };

  for (let wIdx = 0; wIdx < wordIndices.length; wIdx++) {
    const partIdx = wordIndices[wIdx];
    const rawToken = parts[partIdx];
    const bare = stripDiacritics(rawToken);

    if (bare.length < 2) continue;
    const lastChar = bare[bare.length - 1];
    if (lastChar !== 'ة' && lastChar !== 'ه') continue;

    const prevBare = bareAt(wIdx - 1);
    const nextBare = bareAt(wIdx + 1);
    const prevLookup = stripProcliticForLookup(prevBare);
    const prevStem = prevLookup.stem;

    // Normalize candidate forms ending in 'ه' and 'ة' for lexical membership checks
    const asHaa = bare.slice(0, -1) + 'ه';
    const asTeh = bare.slice(0, -1) + 'ة';

    const { stem: stemWithHaa } = stripProcliticForLookup(asHaa);
    const { stem: stemWithTeh } = stripProcliticForLookup(asTeh);

    // Strip `ال` if present for stem lookup
    const withoutAlHaa = stemWithHaa.startsWith('ال') ? stemWithHaa.slice(2) : stemWithHaa;
    const rootCore = asHaa.slice(0, -1);
    const stemCore = stemWithHaa.slice(0, -1);

    // Special contextual disambiguation for `منة الله` / `المنة` / `العلية`
    if (
      (asTeh === 'منة' && (nextBare === 'الله' || nextBare === 'اللة')) ||
      stemWithTeh === 'المنة' ||
      stemWithTeh === 'العلية'
    ) {
      parts[partIdx] = replaceFinalBaseLetter(rawToken, 'ة');
      continue;
    }

    // Rule 1: Closed-class True-Haa words (e.g. هذه, الله, عليه, فيه, مياه, وجه)
    if (
      TRUE_HAA_WORDS.has(asHaa) ||
      TRUE_HAA_WORDS.has(stemWithHaa) ||
      TRUE_HAA_WORDS.has(withoutAlHaa)
    ) {
      parts[partIdx] = replaceFinalBaseLetter(rawToken, 'ه');
      continue;
    }

    // Rule 2: Definite article `ال` + noun ending in `ه` (cannot carry possessive `-ه` unless true-Haa root)
    const hasDefiniteAl =
      asHaa.startsWith('ال') ||
      stemWithHaa.startsWith('ال') ||
      (bare.startsWith('لل') && bare.length >= 4);

    if (hasDefiniteAl) {
      parts[partIdx] = replaceFinalBaseLetter(rawToken, 'ة');
      continue;
    }

    // Rule 3: Ambiguous stems (`كتابه`/`كتابة`, `عمله`/`عملة`, `علمه`/`علمة`, etc.)
    if (AMBIGUOUS_TEH_HAA_STEMS.has(rootCore) || AMBIGUOUS_TEH_HAA_STEMS.has(stemCore)) {
      const hasStrongMasculineModifier = MASCULINE_FOLLOWING_MODIFIERS.has(nextBare);
      const hasVerbCue =
        POSSESSIVE_PRECEDING_VERBS.has(prevBare) ||
        POSSESSIVE_PRECEDING_VERBS.has(prevStem);

      const hasStrongFeminineAgreement =
        FEMININE_PRECEDING_CUES.has(prevBare) ||
        FEMININE_PRECEDING_CUES.has(prevStem) ||
        (nextBare.endsWith('ة') && !nextBare.startsWith('ال')) ||
        FEMININE_TEH_WORDS.has(nextBare.slice(0, -1) + 'ة') ||
        (prevBare.endsWith('ة') && !TRUE_HAA_WORDS.has(prevBare.slice(0, -1) + 'ه'));

      if (hasStrongFeminineAgreement && !hasStrongMasculineModifier) {
        parts[partIdx] = replaceFinalBaseLetter(rawToken, 'ة');
        continue;
      }
      if ((hasStrongMasculineModifier || hasVerbCue) && !hasStrongFeminineAgreement) {
        parts[partIdx] = replaceFinalBaseLetter(rawToken, 'ه');
        continue;
      }
      // Keep user's explicit choice if context is genuinely neutral
      continue;
    }

    // Rule 4: Known Feminine Teh Marbuta lexicon
    if (FEMININE_TEH_WORDS.has(asTeh) || FEMININE_TEH_WORDS.has(stemWithTeh)) {
      parts[partIdx] = replaceFinalBaseLetter(rawToken, 'ة');
      continue;
    }

    // Rule 5: Feminine Nisba (`...يه`) and `-ايه` nouns (`بدايه`, `عربيه`, `تقنيه`)
    if (
      (asHaa.endsWith('يه') && asHaa.length >= 4) ||
      (asHaa.endsWith('ايه') && asHaa.length >= 4)
    ) {
      parts[partIdx] = replaceFinalBaseLetter(rawToken, 'ة');
      continue;
    }

    // Rule 6: Adjacent feminine agreement (e.g., `مدرسه كبيره`, `هذه الحديقه`, `قراءة سريعه`)
    if (lastChar === 'ه') {
      const prevSignalsFeminine =
        FEMININE_PRECEDING_CUES.has(prevBare) ||
        FEMININE_PRECEDING_CUES.has(prevStem) ||
        (prevBare.endsWith('ة') && !TRUE_HAA_WORDS.has(prevBare.slice(0, -1) + 'ه'));

      const nextSignalsFeminine =
        nextBare.endsWith('ة') ||
        (nextBare.length >= 4 &&
          nextBare.endsWith('ه') &&
          FEMININE_TEH_WORDS.has(nextBare.slice(0, -1) + 'ة'));

      if (prevSignalsFeminine || nextSignalsFeminine) {
        parts[partIdx] = replaceFinalBaseLetter(rawToken, 'ة');
      }
    }
  }

  return parts.join('');
}

/**
 * Formats, normalizes, and optionally diacritizes Arabic text according to the user's options.
 */
export function formatArabicText(input: string, options: FormattingOptions): string {
  if (!input) return '';

  let text = input;

  // 1. Remove Tatweel (Kashida)
  if (options.removeTatweel) {
    text = text.replace(/\u0640+/g, '');
  }

  // 2. Configurable Hamza Standardization (supports both new `hamzaMode` and legacy `normalizeAlef`)
  const resolvedHamzaMode: HamzaStandardizationMode =
    options.hamzaMode ?? (options.normalizeAlef ? 'alef_only' : 'none');
  if (resolvedHamzaMode !== 'none') {
    text = standardizeHamza(text, resolvedHamzaMode);
  }

  // 3. Configurable Taa Marbuta (ة) vs. Haa (ه) Differentiation / Normalization
  const resolvedTehHaaMode: TehHaaMode =
    options.tehHaaMode ?? (options.normalizeTehMarbuta ? 'unify_to_haa' : 'none');
  if (resolvedTehHaaMode === 'smart_correct') {
    text = smartDifferentiateTehAndHaa(text);
  } else if (resolvedTehHaaMode === 'unify_to_haa') {
    text = text.replace(/ة/g, 'ه');
  }

  if (options.normalizeAlefMaqsura) {
    text = text.replace(/ى/g, 'ي');
  }

  // 4. Convert Latin punctuation to Arabic equivalents if enabled
  if (options.convertLatinPunctuation) {
    text = text
      .replace(/,/g, '،')
      .replace(/;/g, '؛')
      .replace(/\?/g, '؟');
  }

  // 4. Fix Punctuation spacing: remove space before punctuation, ensure single space after
  if (options.fixPunctuation) {
    // Remove whitespace immediately before punctuation marks
    text = text.replace(/[ \t]+([،؛؟.!:\)\]»])/g, '$1');
    // Remove whitespace immediately after opening brackets/quotes
    text = text.replace(/([\(\[«])[ \t]+/g, '$1');
    // Ensure a single space after sentence/clause punctuation if followed by a word/letter
    text = text.replace(/([،؛؟.!])([^\s\d\n\r،؛؟.!\)\]»"'»])/g, '$1 $2');
    // Ensure single space after colon when followed by a word (but preserve URLs or times like 10:30)
    text = text.replace(/(:)([^\s\d\n\r/])/g, '$1 $2');
  }

  // 5. Remove extra spaces within lines
  if (options.removeExtraSpaces) {
    text = text
      .split(/\r?\n/)
      .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
      .join('\n');
  }

  // 6. Collapse repeated empty lines (3+ newlines -> 2 newlines, or 2+ empty lines -> max 1 empty line)
  if (options.collapseEmptyLines) {
    text = text.replace(/\n{3,}/g, '\n\n').trim();
  }

  // 7. Apply Diacritization Engine
  if (options.diacritizationMode === 'none') {
    text = stripDiacritics(text);
  } else {
    text = diacritizeArabicText(text, options.diacritizationMode);
  }

  return text;
}

/**
 * Segments text into character clusters so each Arabic letter and its attached diacritics
 * can be inspected and edited individually in the Interactive Harakat Editor.
 */
export function segmentArabicClusters(text: string): ArabicCluster[] {
  const clusters: ArabicCluster[] = [];
  const chars = Array.from(text);

  let id = 0;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (SINGLE_DIACRITIC_REGEX.test(ch)) {
      if (clusters.length > 0 && clusters[clusters.length - 1].isArabicLetter) {
        clusters[clusters.length - 1].diacritics += ch;
      } else {
        clusters.push({
          id: id++,
          base: ch,
          diacritics: '',
          isArabicLetter: false,
          isWhitespace: false,
        });
      }
    } else {
      clusters.push({
        id: id++,
        base: ch,
        diacritics: '',
        isArabicLetter: ARABIC_LETTER_REGEX.test(ch),
        isWhitespace: /\s/.test(ch),
      });
    }
  }

  return clusters;
}

/**
 * Reassembles an array of ArabicCluster objects back into a string.
 */
export function clustersToString(clusters: ArabicCluster[]): string {
  return clusters.map((c) => c.base + c.diacritics).join('');
}

/**
 * Updates or toggles a diacritic mark on a specific cluster in a clean Arabic-canonical order
 * (Shadda always precedes vowel/tanween/sukun; only one primary vowel/tanween/sukun at a time).
 */
export function applyDiacriticToCluster(
  currentDiacritics: string,
  mark: string | 'CLEAR'
): string {
  if (mark === 'CLEAR') {
    return '';
  }

  if (mark === HARAKAT.SHADDA) {
    // Toggle Shadda while preserving any existing vowel/tanween
    if (currentDiacritics.includes(HARAKAT.SHADDA)) {
      return currentDiacritics.replace(HARAKAT.SHADDA, '');
    }
    const existingVowel = currentDiacritics.replace(HARAKAT.SHADDA, '');
    return HARAKAT.SHADDA + existingVowel;
  }

  if (mark === HARAKAT.MADDAH || mark === HARAKAT.SUPERSCRIPT_ALEF) {
    return currentDiacritics.includes(mark)
      ? currentDiacritics.replace(mark, '')
      : currentDiacritics + mark;
  }

  // Primary vowel / tanween / sukun: replace any existing primary mark, preserve Shadda if present
  const hasShadda = currentDiacritics.includes(HARAKAT.SHADDA);
  // If tapping the exact same vowel again, toggle it off
  const withoutShadda = currentDiacritics.replace(HARAKAT.SHADDA, '');
  if (withoutShadda === mark) {
    return hasShadda ? HARAKAT.SHADDA : '';
  }

  return (hasShadda ? HARAKAT.SHADDA : '') + mark;
}

/**
 * Finds the next or previous Arabic letter cluster ID in sequence, skipping spaces and punctuation.
 */
export function getAdjacentArabicClusterId(
  clusters: ArabicCluster[],
  currentId: number | null,
  direction: 'next' | 'prev'
): number | null {
  const arabicClusters = clusters.filter((c) => c.isArabicLetter);
  if (arabicClusters.length === 0) return null;
  if (currentId === null) {
    return direction === 'next'
      ? arabicClusters[0].id
      : arabicClusters[arabicClusters.length - 1].id;
  }

  const idx = arabicClusters.findIndex((c) => c.id === currentId);
  if (idx === -1) return arabicClusters[0].id;

  const targetIdx = direction === 'next' ? idx + 1 : idx - 1;
  if (targetIdx < 0 || targetIdx >= arabicClusters.length) {
    return null;
  }
  return arabicClusters[targetIdx].id;
}

export interface FormattingPreset {
  id: string;
  label: string;
  description: string;
  options: FormattingOptions;
}

/**
 * Ready-to-use presets for common Arabic writing, publishing, and search workflows.
 */
export const FORMATTING_PRESETS: FormattingPreset[] = [
  {
    id: 'educational',
    label: 'تشكيل تعليمي كامل',
    description: 'حركات كاملة مع تصحيح الترقيم والهمزات والهاء',
    options: {
      ...DEFAULT_FORMATTING_OPTIONS,
      diacritizationMode: 'full',
      tehHaaMode: 'smart_correct',
      hamzaMode: 'none',
    },
  },
  {
    id: 'editorial',
    label: 'نشر وتدوين خفيف',
    description: 'تشكيل جزئي يضبط الشدة والتنوين مع تنسيق النشر',
    options: {
      ...DEFAULT_FORMATTING_OPTIONS,
      diacritizationMode: 'partial',
      tehHaaMode: 'smart_correct',
      hamzaMode: 'none',
    },
  },
  {
    id: 'clean_search',
    label: 'تنظيف للبحث والأرشفة',
    description: 'إزالة التشكيل وتوحيد الهمزات والهاء والمسافات',
    options: {
      ...DEFAULT_FORMATTING_OPTIONS,
      diacritizationMode: 'none',
      hamzaMode: 'alef_only',
      tehHaaMode: 'unify_to_haa',
      normalizeAlefMaqsura: true,
    },
  },
];

