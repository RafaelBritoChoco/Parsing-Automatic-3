
import JSZip from 'jszip';
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

export const downloadCurrentTab = async (chunks: Chunk[], activeTab: string) => {
    const field = getFieldForTab(activeTab);
    if (!field) return;
    const getCleanFileName = (originalName: string, tab: string) => {
        let name = originalName.replace(/\.[^/.]+$/, "");
        name = name.replace(/^(processed_[A-Z]+_)+/g, '');
        name = name.replace(/ - Step \d.*$/i, '');
        name = name.replace(/ - Raw$/i, '');
        let suffix = '';
        switch (tab) {
            case 'RAW': suffix = 'Raw'; break;
            case 'CLEAN': suffix = 'Step 2 - Clean'; break;
            case 'MACRO': suffix = 'Step 3 - Macro'; break;
            case 'MICRO': suffix = 'Step 4 - Micro'; break;
            case 'FINAL': suffix = 'Step 5 - Final'; break;
            default: suffix = tab;
        }
        return `${name.trim()} - ${suffix}.txt`;
    };
    const filesContent = new Map<string, string>();
    chunks.forEach(c => {
        const content = c[field] || '';
        const current = filesContent.get(c.fileName) || '';
        filesContent.set(c.fileName, current + content + '\n\n');
    });
    if (filesContent.size === 1) {
        const [fileName, text] = filesContent.entries().next().value;
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = getCleanFileName(fileName, activeTab);
        a.click();
        URL.revokeObjectURL(url);
        return;
    }
    const zip = new JSZip();
    filesContent.forEach((text, fileName) => {
        zip.file(getCleanFileName(fileName, activeTab), text);
    });
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Batch_Export_${activeTab}.zip`;
    a.click();
    URL.revokeObjectURL(url);
};
