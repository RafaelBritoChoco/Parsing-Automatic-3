
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
         let prefix = `<<<< CHUNK_START: ${c.id} >>>>\n`;
         if (c.fileName !== currentFile) {
             currentFile = c.fileName;
             prefix = `<<<< FILE_START: ${currentFile} >>>>\n\n` + prefix;
         }
         return `${prefix}${content}`;
     }).join('\n\n');
}

export const getTranslatedTextClean = (chunks: Chunk[]): string => {
    let currentFile = '';
    return chunks.map(c => {
        let content = c.translatedText || '';
        let prefix = `<<<< CHUNK_START: ${c.id} >>>>\n`;
         if (c.fileName !== currentFile) {
             currentFile = c.fileName;
             prefix = `<<<< FILE_START: ${currentFile} >>>>\n\n` + prefix;
         }
         return `${prefix}${content}`;
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

export const downloadCurrentTab = async (chunks: Chunk[], activeTab: string, combineFiles: boolean = false) => {
    const field = getFieldForTab(activeTab);
    if (!field) return;
    const getCleanFileName = (originalName: string, tab: string) => {
        let name = originalName.replace(/\.[^/.]+$/, "");
        name = name.replace(/ \[Page(s)? \d+(-\d+)?\]$/, ""); // Strip pagination suffix
        name = name.replace(/^(processed_[A-Z]+_)+/g, '');
        name = name.replace(/ - Step \d.*$/i, '');
        name = name.replace(/ - Raw$/i, '');
        let suffix = '';
        switch (tab) {
            case 'RAW': suffix = 'DONE step (RAW)'; break;
            case 'CLEAN': suffix = 'DONE step (CLEAN)'; break;
            case 'MACRO': suffix = 'DONE step (MACRO)'; break;
            case 'MICRO': suffix = 'DONE step (MICRO)'; break;
            case 'FINAL': suffix = 'DONE step (FINAL)'; break;
            default: suffix = `DONE step (${tab})`;
        }
        return `${name.trim()} - ${suffix}.txt`;
    };
    const filesContent = new Map<string, string>();
    chunks.forEach(c => {
        const content = c[field] || '';
        const baseFileName = c.fileName.replace(/ \[Page(s)? \d+(-\d+)?\]$/, "");
        const current = filesContent.get(baseFileName) || '';
        filesContent.set(baseFileName, current + content + '\n\n');
    });

    if (combineFiles) {
        let combinedText = '';
        filesContent.forEach((text, fileName) => {
            combinedText += `\n\n================================================================================\n`;
            combinedText += `FILE: ${fileName}\n`;
            combinedText += `================================================================================\n\n`;
            combinedText += text;
        });
        const blob = new Blob([combinedText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Combined_Export_${activeTab}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        return;
    }

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
