
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
2. **FOOTNOTES HANDLING (CRITICAL):** 
   - **Inline Markers** ({{footnotenumber[ID]}}[ID]{{-footnotenumber[ID]}}): Keep them EXACTLY where they are, INSIDE the text paragraphs.
   - **Footnote Bodies** ({{footnote[ID]}}...{{-footnote[ID]}}): ALL footnote bodies MUST be moved and grouped at the very END of the entire chunk/document. NEVER place footnote bodies in the middle of an article, between definition items, or interrupting lists.
   - DO NOT wrap footnote bodies in {{text_level}}. Keep them completely outside.
3. **WRAP BODY TEXT:** Wrap all normal paragraphs, definitions, lists, and tables in {{text_level}}...{{-text_level}}. Each Article's body must be in its own unbroken {{text_level}} block.
4. **SEMANTIC TAGGING (The [L#] Marker):** 
   Inside {{text_level}}, you MUST start EVERY single paragraph, definition, or list item with a short marker [L#], where # is the logical depth:
   - Paragraphs, definitions, or introductory lines under a {{level1}} Article start at **[L2]** (e.g., "[L2] For purposes of this Chapter:", "[L2] customs duty includes...", "[L2] 1. The Parties recognise...").
   - Sub-items and list items (e.g., "(a)", "(b)") nested inside a [L2] paragraph are **[L3]** (e.g., "[L3] (a) charge equivalent...").
   - Sub-sub items (e.g., "(i)", "(ii)") nested inside [L3] are **[L4]** (e.g., "[L4] (i) the digital products...").
   - If the text returns to a new main rule or definition, return to **[L2]**.

5. **SPLITTING MULTIPLE LEVEL PREFIXES ON THE SAME LINE (CRITICAL FOR LIST NUMBERS):**
   If a line of text begins with two nested list markers or numbers (e.g., "(b) (1) Not later than..."), you MUST SPLIT THEM onto separate lines:
   - Put the outer level list prefix on its own line, prefixed with its logical level (e.g., "[L2] (b)").
   - Put the inner level list prefix and its following text on a new line immediately below, prefixed with the next deeper level (e.g., "[L3] (1) Not later than...").
   - This means any child list items of that inner prefix (e.g., "(A)", "(B)") MUST be shifted down to an even deeper level (e.g., "[L4] (A)..." instead of "[L3]").
   - Siblings of the inner prefix (e.g., "(2)") remain at the outer sibling level (e.g., "[L3] (2)...").
   - Siblings of the outer prefix (e.g., "(c)") return to the parent sibling level (e.g., "[L2] (c)...").

**FORMAT TO FOLLOW AND EXAMPLES:**

Example Input text line:
(a) For the purposes of this section:
(1) "Artificial intelligence" means...
(2) "State agency" means...
(b) (1) Not later than December 31, 2023, and annually thereafter...
(A) The name of such system...
(B) A description...
(2) The Department...
(c) Beginning on February 1...

Expected output format with split lines and shifted levels:
{{text_level}}
[L2] (a) For the purposes of this section:
[L3] (1) "Artificial intelligence" means...
[L3] (2) "State agency" means...
[L2] (b)
[L3] (1) Not later than December 31, 2023, and annually thereafter...
[L4] (A) The name of such system...
[L4] (B) A description...
[L3] (2) The Department...
[L2] (c) Beginning on February 1...
{{-text_level}}

**OUTPUT:** Return the full text with headlines preserved, body text wrapped in {{text_level}}, and every body paragraph marked with [L#].
`;
