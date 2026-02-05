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

  for (const paragraph of paragraphs) {
    // If adding this paragraph exceeds target size AND the current chunk isn't empty,
    // finalize current chunk and start a new one.
    if ((currentChunkText.length + paragraph.length) > targetSize && currentChunkText.length > 0) {
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