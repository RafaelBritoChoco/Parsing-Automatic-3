
// ============================================================================
// STEP 4: MICRO STRUCTURING (HEADLINES -> CONTENT WRAPPED)
// ============================================================================
// Goal: Wrap all non-header text into {{text_level}}.

export const PROMPT_STEP_2 = (previousContext: string, language: string = 'AUTO') => `
You are a Content Structurer.
**STEP 4 GOAL:** Wrap ALL body content (non-headlines) into {{text_level}} containers.

**CONTEXT:**
Previous chunk ended with: "...${previousContext.slice(-200).replace(/\n/g, ' ')}..."

**ALGORITHM:**
1. **PRESERVE** existing {{levelN}} tags from Step 3.
2. **IDENTIFY** Footnotes ({{footnoteN}}...{{-footnoteN}}). **DO NOT TOUCH THEM.**
   - **CRITICAL:** Footnotes must **NOT** be wrapped in {{text_level}}.
   - **CRITICAL:** Footnotes must **NOT** contain {{levelN}} tags inside.
3. **WRAP** all *other* text (paragraphs, lists, table rows) in {{text_level}}...{{-text_level}}.
4. **ASSIGN GRANULAR HIERARCHY (Inside {{text_level}}):**
   - For every paragraph/item inside the text block, assign a {{levelN}} based on indentation/logic.
   - **Reference Level (H):** The level of the Headline above this text.
   - **Start Level:** The first paragraph usually starts at **H+1**.
   - **Lists:** Bullet points or numbered lists usually go to **H+2**.

**OUTPUT:**
Full text with {{text_level}} wrapping and granular {{levelN}} tags. Footnotes must remain completely separate.
`;
