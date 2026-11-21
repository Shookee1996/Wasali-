import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HARAKAT,
  DEFAULT_FORMATTING_OPTIONS,
  analyzeArabicText,
  stripDiacritics,
  diacritizeArabicText,
  formatArabicText,
  standardizeHamza,
  smartDifferentiateTehAndHaa,
  segmentArabicClusters,
  clustersToString,
  applyDiacriticToCluster,
  getAdjacentArabicClusterId,
  FORMATTING_PRESETS,
} from './arabicEngine';

test('analyzeArabicText counts words, chars with/without diacritics, and diacritic marks accurately', () => {
  const vocalized = 'اللُّغَةُ الْعَرَبِيَّةُ';
  const stats = analyzeArabicText(vocalized);
  assert.equal(stats.words, 2);
  assert.equal(stats.charsWithoutDiacritics, 'اللغة العربية'.length);
  assert.ok(stats.charsWithDiacritics > stats.charsWithoutDiacritics);
  assert.equal(stats.diacriticMarks, stats.charsWithDiacritics - stats.charsWithoutDiacritics);
  assert.equal(stats.lines, 1);

  const emptyStats = analyzeArabicText('');
  assert.equal(emptyStats.words, 0);
  assert.equal(emptyStats.charsWithoutDiacritics, 0);
});

test('stripDiacritics removes all harakat while preserving base letters', () => {
  assert.equal(stripDiacritics('بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ'), 'بسم الله الرحمن الرحيم');
});

test('diacritizeArabicText vocalizes lexicon entries and sun/moon definite articles', () => {
  const input = 'اللغة العربية جميلة';
  const full = diacritizeArabicText(input, 'full');
  assert.equal(full, 'اللُّغَةُ الْعَرَبِيَّةُ جَمِيلَةٌ');

  // Sun letter rule for unknown word (ال + س -> السّ...)
  const sunWord = diacritizeArabicText('السحاب', 'full');
  assert.ok(sunWord.includes(HARAKAT.SHADDA), 'Sun letter after ال should receive Shadda');

  // Moon letter rule for unknown word (ال + ق -> الْ...)
  const moonWord = diacritizeArabicText('القلم', 'full');
  assert.ok(moonWord.startsWith('ال' + HARAKAT.SUKUN), 'Moon letter after ال should put Sukun on Lam');

  // Pattern rule: تفعيل (تنسيق / تشكيل / تطوير)
  const masdar = diacritizeArabicText('تطوير', 'full');
  assert.equal(masdar, 'تَطْوِير');

  // Plural Alif al-Fariqah: كتبوا should not put fatha on trailing waw
  const pluralVerb = diacritizeArabicText('كتبوا', 'full');
  assert.equal(pluralVerb.includes('وَ'), false);
});

test('partial diacritization retains shadda/tanween/endings while reducing clutter', () => {
  const full = diacritizeArabicText('اللغة العربية جميلة', 'full');
  const partial = diacritizeArabicText('اللغة العربية جميلة', 'partial');
  assert.ok(partial.length < full.length);
  assert.ok(partial.includes(HARAKAT.SHADDA));
  assert.ok(partial.includes(HARAKAT.DAMMATAN));
});

test('formatArabicText fixes extra spaces, repeated blank lines, and punctuation spacing', () => {
  const messy = 'مرحبا   بكم , في   تطبيق   تشكيل  النصوص .\n\n\n\nكيف   حالكم ? ';
  const formatted = formatArabicText(messy, {
    ...DEFAULT_FORMATTING_OPTIONS,
    diacritizationMode: 'none',
    tehHaaMode: 'none',
  });
  assert.equal(formatted, 'مرحبا بكم، في تطبيق تشكيل النصوص.\n\nكيف حالكم؟');
});

test('standardizeHamza supports alef_only, all_to_alef, and all_to_hamza modes', () => {
  const sample = 'أحمد وإبراهيم وآمال قرؤوا أسئلة';
  assert.equal(standardizeHamza(sample, 'none'), sample);
  assert.equal(standardizeHamza(sample, 'alef_only'), 'احمد وابراهيم وامال قرؤوا اسئلة');
  assert.equal(standardizeHamza(sample, 'all_to_alef'), 'احمد وابراهيم وامال قراوا اسالة');
  assert.equal(standardizeHamza(sample, 'all_to_hamza'), 'ءحمد وءبراهيم وءمال قرءوا ءسءلة');
});

test('smartDifferentiateTehAndHaa distinguishes Taa Marbuta vs Haa from linguistic context', () => {
  // Corrects definite nouns (`المدرسه`, `الحديقه`) and true-Haa words (`هذة`, `مياة`, `اللة`)
  assert.equal(
    smartDifferentiateTehAndHaa('هذة المدرسه والحديقه فيها مياة جميله'),
    'هذه المدرسة والحديقة فيها مياه جميلة'
  );

  // Ambiguous stem `كتابه` / `كتابة` resolved by syntactic context
  assert.equal(
    smartDifferentiateTehAndHaa('قرأ كتابة الجديد ثم مارس كتابه جميله'),
    'قرأ كتابه الجديد ثم مارس كتابة جميلة'
  );

  // Ambiguous stem `عمله` / `عملة` and `عليه` / `العلية`
  assert.equal(
    smartDifferentiateTehAndHaa('وجد عمله ذهبية على مكتبه وشكر منة اللة'),
    'وجد عملة ذهبية على مكتبه وشكر منة الله'
  );
});

test('formatArabicText integrates configurable hamzaMode and tehHaaMode', () => {
  const raw = 'هذة الإدارة الآلية رائعه وكتابةُ الجديدُ مفيد';
  const unified = formatArabicText(raw, {
    ...DEFAULT_FORMATTING_OPTIONS,
    diacritizationMode: 'none',
    hamzaMode: 'all_to_alef',
    tehHaaMode: 'unify_to_haa',
  });
  assert.equal(unified, 'هذه الاداره الاليه رااعه وكتابه الجديد مفيد');
});

test('segmentArabicClusters and applyDiacriticToCluster support interactive manual harakat editing', () => {
  const word = 'مِشْكال';
  const clusters = segmentArabicClusters(word);
  assert.equal(clusters.length, 5);
  assert.equal(clusters[0].base, 'م');
  assert.equal(clusters[0].diacritics, HARAKAT.KASRA);

  // Add Shadda then Fatha to cluster 2 ('ك')
  clusters[2].diacritics = applyDiacriticToCluster(clusters[2].diacritics, HARAKAT.SHADDA);
  clusters[2].diacritics = applyDiacriticToCluster(clusters[2].diacritics, HARAKAT.FATHA);
  assert.equal(clusters[2].diacritics, HARAKAT.SHADDA + HARAKAT.FATHA);

  // Toggling same vowel removes vowel while keeping Shadda
  clusters[2].diacritics = applyDiacriticToCluster(clusters[2].diacritics, HARAKAT.FATHA);
  assert.equal(clusters[2].diacritics, HARAKAT.SHADDA);

  // Clear removes all marks
  clusters[2].diacritics = applyDiacriticToCluster(clusters[2].diacritics, 'CLEAR');
  assert.equal(clusters[2].diacritics, '');

  assert.equal(clustersToString(clusters), 'مِشْكال');
});

test('getAdjacentArabicClusterId steps across Arabic letters while skipping whitespace', () => {
  const clusters = segmentArabicClusters('من هنا');
  const firstId = getAdjacentArabicClusterId(clusters, null, 'next');
  assert.equal(firstId, 0); // 'م'
  const secondId = getAdjacentArabicClusterId(clusters, firstId, 'next');
  assert.equal(secondId, 1); // 'ن'
  const thirdId = getAdjacentArabicClusterId(clusters, secondId, 'next');
  assert.equal(thirdId, 3); // skips space at id 2, lands on 'ه'
  const backId = getAdjacentArabicClusterId(clusters, thirdId, 'prev');
  assert.equal(backId, 1); // back to 'ن'
});

test('FORMATTING_PRESETS apply clean distinct workflows', () => {
  const sample = 'أحمدُ في المَدرَسَه';
  const searchPreset = FORMATTING_PRESETS.find((p) => p.id === 'clean_search');
  assert.ok(searchPreset);
  assert.equal(formatArabicText(sample, searchPreset.options), 'احمد في المدرسه');
});
