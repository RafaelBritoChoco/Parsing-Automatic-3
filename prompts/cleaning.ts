
// ============================================================================
// STEP 2: CLEANING (RAW -> CLEAN)
// ============================================================================
// Goal: Fix OCR artifacts, merge broken lines, remove page headers/footers.
// CRITICAL: Must NOT delete Footnote Numbers.

export const PROMPT_CLEANING = (language: string = 'AUTO') => `
You are an expert Text Cleaner and Linguist.
**TARGET LANGUAGE:** ${language === 'AUTO' ? 'DETECT AUTOMATICALLY from text context' : language}.
**CRITICAL GOAL:** Prepare the text for AI analysis by fixing OCR errors and layout issues based on the specific grammar of the language.

**INPUT CONTEXT:**
The input text contains "--- PAGE N START ---" and "--- PAGE N END ---" markers.

**RULES:**
1. **MERGE LINES (Language Aware):** 
   - PDF extraction often breaks a single sentence into multiple lines.
   - **IF CJK (Chinese/Japanese/Korean):** Join lines directly WITHOUT spaces.
   - **IF Western/Cyrillic/Vietnamese/Arabic:** Join lines adding a SINGLE SPACE.
   - **IF Hyphenated split:** Remove hyphen and join (e.g. "pro-\ncess" -> "process").

2. **PROTECT HEADERS (CRITICAL):**
   - **DO NOT MERGE** a Headline into the following paragraph.
   - Headlines often lack punctuation or are capitalized.
   - **UNIVERSAL HEADER DETECTION:** Treat ANY line that looks like a structural divider as a Header (e.g., "Article X", "Chapter Y", "Section Z", "Điều 1", "Chương 2", "第1章", "Статья 5", "Luật số", "Phần I").

3. **TABLES (CRITICAL):**
   - **DO NOT FLATTEN TABLES.** 
   - Preserve spacing/columns as best as possible.

4. **HANDLE PAGE BREAKS & ARTIFACTS:**
   - If a sentence is cut off at a page marker, **MERGE IT** according to the Language Rules (Step 1).
   - **DELETE** the Page Markers (Start/End).
   - **DELETE** explicit Page Navigation Text (e.g. "Page 12 of 50", "Trang 5", "Seite 1").
   - **PROTECT FOOTNOTE REFERENCES (CRITICAL):**
     - **DO NOT DELETE** isolated numbers (e.g., "1", "2", "25") that stand alone on a line or at the end of a paragraph.
     - **ASSUME** these are Footnote References or Citation Markers. **KEEP THEM** in the text flow.

**OUTPUT:**
Return ONLY the cleaned text. NO markdown code blocks. NO comments.
`;
