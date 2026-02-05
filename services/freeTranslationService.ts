/**
 * FREE TRANSLATION SERVICE
 * Uses the public "GTX" endpoint (similar to browser built-in translation).
 * 
 * FEATURES:
 * 1. Batching: Splits text into small chunks to avoid URL length errors (Memory Safe).
 * 2. Rate Limiting: Adds delays to prevent 429 (Too Many Requests).
 * 3. Tag Repair: Fixes structural tags that the translator might mangle.
 */

const MAX_CHUNK_LENGTH = 1800; // Safe limit for GET requests
const DELAY_MS = 300; // Throttle to be polite

export const translateTextFree = async (text: string): Promise<string> => {
  if (!text) return '';

  // 1. Split text into safe chunks (by paragraphs)
  const segments = text.split('\n');
  const batches: string[] = [];
  let currentBatch = '';

  for (const segment of segments) {
    if ((currentBatch.length + segment.length) > MAX_CHUNK_LENGTH) {
      batches.push(currentBatch);
      currentBatch = '';
    }
    currentBatch += segment + '\n';
  }
  if (currentBatch) batches.push(currentBatch);

  // 2. Process batches sequentially
  let translatedFullText = '';

  for (const batch of batches) {
    if (!batch.trim()) {
        translatedFullText += '\n';
        continue;
    }

    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(batch)}`;
        const res = await fetch(url);
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const data = await res.json();
        
        // Data format is [[["translated", "original", ...], ...], ...]
        // We join the first element of each array segment
        const translatedBatch = data[0].map((item: any) => item[0]).join('');
        translatedFullText += translatedBatch;

    } catch (e) {
        console.error("Translation chunk failed, keeping original:", e);
        translatedFullText += batch; // Fallback to original on error
    }

    // Safety delay
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  // 3. Post-Processing: Repair Structure Tags
  // Translators often introduce spaces in code-like tags (e.g. "{{ level 1 }}")
  // We use Regex to snap them back to "{{level1}}" format.
  
  let repaired = translatedFullText;

  // Fix Headers: {{ level 1 }} -> {{level1}}
  repaired = repaired.replace(/{{\s*level\s*(\d+)\s*}}/gi, '{{level$1}}');
  repaired = repaired.replace(/{{\s*-\s*level\s*(\d+)\s*}}/gi, '{{-level$1}}');
  
  // Fix Container: {{ text _ level }} -> {{text_level}}
  repaired = repaired.replace(/{{\s*text\s*[-_]?\s*level\s*}}/gi, '{{text_level}}');
  repaired = repaired.replace(/{{\s*-\s*text\s*[-_]?\s*level\s*}}/gi, '{{-text_level}}');

  // Fix Footnotes: {{ footnotenumber 1 }} -> {{footnotenumber1}}
  repaired = repaired.replace(/{{\s*footnotenumber\s*(\d+)\s*}}/gi, '{{footnotenumber$1}}');
  repaired = repaired.replace(/{{\s*-\s*footnotenumber\s*(\d+)\s*}}/gi, '{{-footnotenumber$1}}');
  repaired = repaired.replace(/{{\s*footnote\s*(\d+)\s*}}/gi, '{{footnote$1}}');
  repaired = repaired.replace(/{{\s*-\s*footnote\s*(\d+)\s*}}/gi, '{{-footnote$1}}');

  return repaired;
};