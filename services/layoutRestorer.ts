
/**
 * DETERMINISTIC LAYOUT RESTORER
 * 
 * This service uses "Mathematical" (Algorithmic/Regex) rules to fix text layout 
 * instead of AI interpretation. This guarantees 0% content loss/hallucination.
 */

export const restoreLayoutDeterministically = (text: string): string => {
    if (!text) return '';

    // 1. SMART LINE NUMBER REMOVAL
    // Removes legal margin numbers (1, 2, 3...) while keeping list items (1., 2)) and data (50, 1996).
    let processed = removeLegalLineNumbers(text);

    // 2. HEADER/FOOTER NOISE REDUCTION
    // Remove isolated page numbers often found in OCR (e.g., "12" or "Page 12" on a line by itself)
    // Heuristic: Line matches strict pattern, surrounded by newlines
    processed = processed.replace(/\n\s*(?:Page\s*)?\d+\s*\n/gi, '\n');

    // 3. FIX HYPHENATION (Word split across lines)
    // Matches: Word character + hyphen + newline + optional whitespace + Word character
    // Action: Remove hyphen and newline, join directly.
    // Ex: "pro-\ncess" -> "process"
    processed = processed.replace(/([a-zA-Z\u00C0-\u00FF])-\n\s*([a-zA-Z\u00C0-\u00FF])/g, '$1$2');

    // 4. MERGE BROKEN LINES (Sentence split across lines)
    // Heuristic: If a line ends with a character that IS NOT a sentence terminator (. ! ?)
    // AND the next line starts with a lowercase character (continuation), join them.
    // We treat double newlines (\n\n) as paragraphs, so we only target single \n.
    
    // Step 4a: Protect paragraphs. Temporarily replace \n\n with a placeholder.
    const PARAGRAPH_MARKER = '___PARA___';
    processed = processed.replace(/\n\s*\n/g, PARAGRAPH_MARKER);

    // Step 4b: Join lines where flow suggests continuity.
    // Look for: [Not Punctuation] + [Newline] + [Lowercase ONLY]
    // CRITICAL FIX: Removed '0-9' from the second group to prevent Headlines (no punct) 
    // from merging with List Items (start with number).
    // ex: "Article 1" + "\n" + "1. Text" -> Should NOT merge.
    processed = processed.replace(/([^\.\!\?\:\n])\n\s*([a-z\u00C0-\u00FF])/g, '$1 $2');

    // Step 4c: Restore paragraphs
    processed = processed.replace(new RegExp(PARAGRAPH_MARKER, 'g'), '\n\n');

    // 5. NORMALIZE SPACES - REMOVED!
    // Previous version collapsed "Code    Description" to "Code Description", destroying tables.
    // We now KEEP multiple spaces to preserve columnar layout for the AI to see.
    // processed = processed.replace(/[ \t]+/g, ' '); 

    return processed.trim();
};

/**
 * Advanced script-like logic to strip sequential line numbers.
 * Mimics a human checking: "Is this 1? Is the next one 2? Does it have a dot?"
 */
function removeLegalLineNumbers(text: string): string {
    const lines = text.split('\n');
    const resultLines: string[] = [];
    
    // State machine to track the sequence
    let expectedNum = 1;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        
        // Regex Breakdown:
        // ^\s*       : Start of line, optional indentation
        // (\d+)      : Capture Group 1: The Number
        // ([\s\.\)]+)? : Capture Group 2: The Separator (space, dot, paren). Optional.
        // (.*)       : Capture Group 3: The rest of the content
        const match = line.match(/^\s*(\d+)([\s\.\)]+)?(.*)/);
        
        if (match) {
            const numStr = match[1];
            const numVal = parseInt(numStr, 10);
            const separator = match[2] || '';
            const restOfLine = match[3] || '';

            // HEURISTIC 1: LIST PROTECTION
            // If the separator explicitly contains a dot '.' or paren ')', 
            // it is likely a markdown list item (e.g., "1. Definitions"). Keep it.
            const isExplicitList = separator.includes('.') || separator.includes(')');

            // HEURISTIC 2: YEAR PROTECTION
            // Values like 1996, 2024 are usually years, not line numbers.
            const isYear = numVal > 1900 && numVal < 2100;
            
            // HEURISTIC 3: FOOTNOTE PROTECTION (SINGLE SPACE)
            // If the separator is strictly a single space (e.g. "1 For..."), it is highly ambiguous.
            // It could be "Line 1" or "Footnote 1".
            // To be safe (Lossless), we DO NOT remove it. 
            // We only remove if there is a distinct gap (multiple spaces/tabs) OR if we are very sure.
            // Note: OCR marginal numbers often have >1 space or tabs.
            const isSingleSpace = separator === ' ';

            // HEURISTIC 4: SEQUENCE VALIDATION
            // It must match our expected counter, OR be a reset to 1 (new page/section).
            const isSequential = (numVal === expectedNum) || (numVal === 1);

            // DECISION: Only remove if it's sequential AND NOT a list/year AND NOT just a single space.
            if (isSequential && !isExplicitList && !isYear && !isSingleSpace) {
                
                // If we found a valid line number, strip it.
                // We use 'restOfLine' which is the text AFTER the number and separator.
                line = restOfLine.trim();

                // Increment expectation
                if (numVal === 1) expectedNum = 2;
                else expectedNum++;
                
            } else {
                // If we skipped removing it (e.g. it was a single space footnote "1 Text"), 
                // we treat it as content. 
                // We do NOT increment expectedNum because we assume we haven't seen a "valid marginal line number" yet.
            }
        }

        resultLines.push(line);
    }

    return resultLines.join('\n');
}
