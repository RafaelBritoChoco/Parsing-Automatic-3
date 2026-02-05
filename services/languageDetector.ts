
import { LanguageCode } from '../types';

/**
 * Deterministic Language Detector
 * Uses Regex to count common stopwords and structural keywords in the first 2000 characters.
 */
export const detectLanguage = (text: string): LanguageCode => {
  if (!text || text.length < 50) return 'AUTO';

  // Sample only the start of the document for speed
  const sample = text.slice(0, 2000).toLowerCase();

  const scores: Record<string, number> = {
    'VI': 0, 'EN': 0, 'PT': 0, 'ES': 0, 'FR': 0, 'DE': 0, 
    'IT': 0, 'NL': 0, 'RU': 0, 'ZH': 0, 'JA': 0, 'KO': 0, 'AR': 0, 'HI': 0
  };

  // Specific Regex Rules for Languages
  const rules: Record<string, RegExp[]> = {
    'VI': [/\b(của|và|là|những|trong|việc|điều|chương|khoản|luật|nghị định)\b/g, /[ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ]/g],
    'PT': [/\b(de|que|do|da|para|com|não|artigo|lei|capítulo)\b/g, /[\u00C0-\u00FF]/g],
    'EN': [/\b(the|and|of|to|in|is|that|section|chapter|article)\b/g],
    'ES': [/\b(de|que|el|la|en|y|los|del|se|artículo|ley)\b/g],
    'FR': [/\b(le|la|les|de|des|en|un|une|est|article|chapitre)\b/g],
    'DE': [/\b(der|die|das|und|in|den|von|zu|artikel|kapitel)\b/g],
    'IT': [/\b(il|la|di|che|in|per|un|articolo)\b/g],
    'NL': [/\b(de|van|een|en|het|in|is|artikel)\b/g],
    'RU': [/[\u0400-\u04ff]+/g, /\b(статья|глава|раздел)\b/g],
    'ZH': [/([^\x00-\xff]+)/g, /(第[0-9]+章|条)/g], // Chinese characters range
    'JA': [/([\u3040-\u309f\u30a0-\u30ff]+)/g], // Hiragana/Katakana
    'KO': [/([\uac00-\ud7af]+)/g], // Hangul
    'AR': [/([\u0600-\u06ff]+)/g], // Arabic
    'HI': [/([\u0900-\u097f]+)/g], // Devanagari
  };

  // Scoring
  for (const [lang, patterns] of Object.entries(rules)) {
      patterns.forEach(regex => {
          const matches = sample.match(regex);
          if (matches) {
              // Higher weight for exact keyword matches
              scores[lang] += matches.length;
          }
      });
  }

  // Find Winner
  let bestLang: string = 'AUTO';
  let maxScore = 0;

  for (const [lang, score] of Object.entries(scores)) {
      if (score > maxScore) {
          maxScore = score;
          bestLang = lang;
      }
  }

  // Threshold: If we didn't find significant matches (e.g. OCR garbage), keep AUTO
  if (maxScore < 3) return 'AUTO';

  return bestLang as LanguageCode;
};
