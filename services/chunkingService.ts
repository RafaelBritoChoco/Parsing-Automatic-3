import { Chunk } from '../types';

/**
 * Splits text into chunks deterministically based on paragraph boundaries.
 * Tries to fill up to `targetSize` characters without breaking paragraphs.
 */
export const createChunks = (fullText: string, targetSize: number, fileName: string, startId: number = 0): Chunk[] => {
  // Split by double newline to preserve paragraph integrity
  const paragraphs = fullText.split(/\n\s*\n/);
  const chunks: Chunk[] = [];
  
  let currentChunkText = '';
  let chunkId = startId;

  // Regex to detect major legal headings (e.g., "Capítulo 1", "Article 5", "Sección A")
  const isMajorHeading = (text: string) => {
      const t = text.trim();
      const startsWithKeyword = /^(cap[ií]tulo|art[ií]culo|secci[oó]n|t[ií]tulo|parte|anexo|ap[eé]ndice|chapter|article|section|title|part|annex|appendix|pre[aá]mbulo|preamble)\b/i.test(t);
      // Headings are usually short (less than 200 characters) and don't end with a period (unless it's an abbreviation, but we simplify)
      const isShort = t.length < 200;
      return startsWithKeyword && isShort;
  };

  for (const paragraph of paragraphs) {
    const isHeading = isMajorHeading(paragraph);
    const willExceedSize = (currentChunkText.length + paragraph.length) > targetSize;
    // We prefer to split at a major heading if the chunk is already reasonably large (e.g., > 60% of target size)
    const isGoodSplitPoint = isHeading && currentChunkText.length > (targetSize * 0.6);

    // If adding this paragraph exceeds target size OR it's a good logical split point,
    // finalize current chunk and start a new one.
    if ((willExceedSize || isGoodSplitPoint) && currentChunkText.length > 0) {
      chunks.push({
        id: chunkId++,
        fileName,
        originalText: currentChunkText.trim(),
        cleanedText: '',
        step1Text: '',
        step2Text: '',
        finalText: '',
        status: 'PENDING'
      });
      currentChunkText = '';
    }
    
    currentChunkText += paragraph + '\n\n';
  }

  // Push final chunk
  if (currentChunkText.trim().length > 0) {
    chunks.push({
      id: chunkId++,
      fileName,
      originalText: currentChunkText.trim(),
      cleanedText: '',
      step1Text: '',
      step2Text: '',
      finalText: '',
      status: 'PENDING'
    });
  }

  return chunks;
};

/**
 * Parses text that contains "--- CHUNK N ---" delimiters to restore exact chunk structure.
 */
export const parseChunksFromFormattedText = (formattedText: string, defaultFileName: string = 'imported.txt'): Chunk[] => {
    const chunkRegex = /--- CHUNK (\d+) ---\n([\s\S]*?)(?=(?:--- CHUNK \d+ ---)|$)/g;
    const chunks: Chunk[] = [];
    let match;
    
    while ((match = chunkRegex.exec(formattedText)) !== null) {
        const id = parseInt(match[1]);
        const content = match[2].trim();
        chunks.push({
            id,
            fileName: defaultFileName,
            originalText: content, // Placeholder, will be mapped to correct field by caller
            cleanedText: '',
            step1Text: '',
            step2Text: '',
            finalText: '',
            status: 'PENDING'
        });
    }
    
    return chunks;
};