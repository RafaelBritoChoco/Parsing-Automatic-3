
// ============================================================================
// STEP 4: MICRO STRUCTURING (HEADLINES -> CONTENT WRAPPED)
// ============================================================================
// Goal: Wrap all non-header text into {{text_level}}.

export const PROMPT_STEP_2 = (previousContext: string, language: string = 'AUTO') => `
You are an Expert Semantic Content Structurer.
**STEP 4 GOAL:** Wrap ALL body content (non-headlines) into {{text_level}} containers and assign a semantic level to EVERY paragraph using short markers [L#].
**CRITICAL:** OUTPUT THE FULL TEXT VERBATIM. DO NOT SUMMARIZE, DO NOT SKIP ARTICLES, DO NOT CHANGE THE BODY TEXT. IF YOU SKIP EVEN A SINGLE WORD, THE PROCESS WILL FAIL.

**CONTEXT:**
Previous chunk ended with: "...${previousContext.slice(-200).replace(/\n/g, ' ')}..."

**RULES FOR INTERPRETATIVE HIERARCHY (CRITICAL):**
1. **PRESERVE HEADLINES:** Keep all existing {{levelN}}...{{-levelN}} tags from Step 3 exactly as they are.
2. **FOOTNOTES HANDLING:** 
   - **Inline Markers** ({{footnotenumber[ID]}}[ID]{{-footnotenumber[ID]}}): Keep them EXACTLY where they are, INSIDE the text paragraphs.
   - **Footnote Bodies** ({{footnote[ID]}}...{{-footnote[ID]}}): Keep them at the bottom. DO NOT wrap footnote bodies in {{text_level}}.
3. **WRAP BODY TEXT:** Wrap all normal paragraphs, lists, and tables in {{text_level}}...{{-text_level}}.
4. **SEMANTIC TAGGING (The [L#] Marker):** 
   Inside {{text_level}}, you MUST start EVERY single paragraph or list item with a short marker [L#], where # is the logical depth.
   - NO DETERMINISTIC MATH. Read and understand the content.
   - If a paragraph introduces a new main thought or general rule under the current headline, assign it a base level (e.g., [L2] or [L3] depending on the headline above it).
   - If the next paragraph is a condition, exception, elaboration, or sub-item of the previous one, it MUST be subordinated (e.g., [L3] or [L4]).
   - If the text returns to a new general rule, return to the higher level.

**FORMAT TO FOLLOW:**
{{level1}}ARTICLE 1 - DEFINITIONS{{-level1}}
{{text_level}}
[L2] This is the main rule of the article.
[L3] This is an exception to the rule above.
[L3] This is another condition to the rule.
[L2] This is a completely new rule in the same article.
{{-text_level}}
{{footnote1}}Footnote text here{{-footnote1}}

**OUTPUT:** Return the full text with headlines preserved, body text wrapped in {{text_level}}, and every body paragraph marked with [L#].
`;
