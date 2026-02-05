
import { Chunk } from '../types';

export const getFieldForTab = (tab: string): keyof Chunk | null => {
    if (tab === 'RAW') return 'originalText';
    if (tab === 'CLEAN') return 'cleanedText';
    if (tab === 'MACRO') return 'step1Text'; 
    if (tab === 'MICRO') return 'step2Text';
    if (tab === 'FINAL') return 'finalText';
    return null;
}

export const getActiveTextWithDelimiters = (chunks: Chunk[], activeTab: string): string => {
    const field = getFieldForTab(activeTab);
    if (!field) return '';
    let currentFile = '';
    return chunks.map(c => {
       let prefix = '';
       if (c.fileName !== currentFile) {
           currentFile = c.fileName;
           prefix = `\n<<<< FILE_START: ${currentFile} >>>>\n`;
       }
       return `${prefix}--- CHUNK ${c.id} ---\n${c[field] || ''}`;
    }).join('\n\n');
};

export const getActiveTextClean = (chunks: Chunk[], activeTab: string): string => {
     const field = getFieldForTab(activeTab);
     if (!field) return '';
     let currentFile = '';
     return chunks.map(c => {
         let content = c[field] || '';
         if (c.fileName !== currentFile) {
             currentFile = c.fileName;
             return `<<<< FILE_START: ${currentFile} >>>>\n\n${content}`;
         }
         return content;
     }).join('\n\n');
}

export const getTranslatedTextClean = (chunks: Chunk[]): string => {
    let currentFile = '';
    return chunks.map(c => {
        let content = c.translatedText || '';
         if (c.fileName !== currentFile) {
             currentFile = c.fileName;
             return `<<<< FILE_START: ${currentFile} >>>>\n\n${content}`;
         }
         return content;
    }).join('\n\n');
};

export const parseGlobalChange = (newText: string, currentChunks: Chunk[], activeTab: string): Chunk[] => {
    const regex = /--- CHUNK (\d+) ---\n([\s\S]*?)(?=(?:--- CHUNK \d+ ---)|$)/g;
    let match;
    const newChunks = [...currentChunks];
    let found = false;
    while ((match = regex.exec(newText)) !== null) {
        found = true;
        const id = parseInt(match[1]);
        const content = match[2]; 
        const chunkIndex = newChunks.findIndex(c => c.id === id);
        if (chunkIndex !== -1) {
            const field = getFieldForTab(activeTab);
            if (field) newChunks[chunkIndex] = { ...newChunks[chunkIndex], [field]: content };
        }
    }
    return found ? newChunks : currentChunks;
};
