
import * as pdfjsLib from 'pdfjs-dist';
// Explicitly importing types is tricky with pdfjs-dist in this environment, so we use `any` for library objects mostly.

// FIX: Sincronizado o worker com a versão exata da biblioteca (v5.4.624) para evitar o erro de mismatch
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@5.4.624/build/pdf.worker.min.mjs`;

export const extractTextFast = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items as any[];

    // 1. Sort items primarily by Y (top to bottom), then X (left to right)
    // Note: PDF coordinates usually start at bottom-left, so higher Y is higher on page.
    items.sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5]; 
        if (Math.abs(yDiff) > 9) return yDiff; // Lines are distinct if Y differs by >9 units
        return a.transform[4] - b.transform[4]; // Otherwise sort by X
    });

    // 2. Calculate Page Metrics (Min X for Left Margin)
    let minX = Infinity;
    items.forEach(item => {
        if (item.str.trim().length > 0) {
            if (item.transform[4] < minX) minX = item.transform[4];
        }
    });
    if (minX === Infinity) minX = 0;

    let pageText = '';
    let lastY = -1;
    let lastX = -1;
    let lastWidth = 0;

    for (const item of items) {
        const str = item.str;
        const x = item.transform[4];
        const y = item.transform[5];
        const width = item.width;

        if (lastY !== -1 && Math.abs(y - lastY) > 9) {
             pageText += '\n';
             const indentUnits = Math.max(0, x - minX);
             const spaces = Math.floor(indentUnits / 4.5); 
             if (spaces > 0) {
                 pageText += ' '.repeat(spaces);
             }
        } 
        else if (pageText.length > 0 && !pageText.endsWith('\n')) {
             const gap = x - (lastX + lastWidth);
             if (gap > 10) {
                 const spaces = Math.floor(gap / 4.5);
                 pageText += ' '.repeat(Math.min(spaces, 10));
             } else if (gap > 1) { 
                 if (!pageText.endsWith(' ')) pageText += ' ';
             }
        }
        
        pageText += str;
        lastY = y;
        lastX = x;
        lastWidth = width;
    }

    // Identify page number candidates at the top or bottom of the page (to make it easy for CLEAN stage)
    const lines = pageText.split('\n');
    const totalLines = lines.length;
    const PAGE_NUMBER_REGEX = /^\s*(?:page|pagina|página|pág|pag|trang|seite|of|de)?\s*[-–—/\\|•#]*\s*\d+\s*(?:of|de|\/|\\)?\s*\d*\s*$/i;
    const SIMPLE_NUMBER_REGEX = /^\s*[-–—_\[\(\{#]*\s*\d+\s*[-–—_\]\)\}]*\s*$/;

    const taggedLines = lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.length > 30) return line;
        
        // Check if it sits at the headers/footers (first 3 or last 3 lines)
        const isHeaderOrFooter = idx <= 2 || idx >= totalLines - 3;
        if (!isHeaderOrFooter) return line;

        // Ensure it looks like a page number structure
        const isPageNum = PAGE_NUMBER_REGEX.test(trimmed) || SIMPLE_NUMBER_REGEX.test(trimmed);
        if (isPageNum) {
            return `[PAGE_NUMBER_CANDIDATE: ${trimmed}]`;
        }
        return line;
    });
    
    const processedPageText = taggedLines.join('\n');

    fullText += `--- PAGE ${i} START ---\n`;
    fullText += processedPageText;
    fullText += `\n--- PAGE ${i} END ---\n\n`;
    
    // Memory cleanup
    page.cleanup();

    // Yield to browser every 10 pages to prevent UI freeze and WebSocket timeout
    if (i % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  await pdf.destroy();
  return fullText;
};

export const extractImagesForDeepOCR = async (file: File): Promise<string[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const images: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 }); // Reduced from 2.0 to 1.5 for faster processing without losing legibility
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (context) {
      // CRITICAL FIX: Fill background with white before rendering. 
      // PDFs often have transparent backgrounds. If exported as JPEG, transparent becomes black, 
      // resulting in black text on a black background, which completely breaks OCR and causes timeouts.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: context, viewport: viewport } as any).promise;
      const base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1]; // Reduced quality from 0.8 to 0.7 for faster upload
      images.push(base64);
    }
    
    // Memory cleanup
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();

    // Yield to browser every 5 pages to prevent UI freeze and WebSocket timeout
    if (i % 5 === 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  await pdf.destroy();
  return images;
};
