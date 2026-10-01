
// ============================================================================
// STEP 3: MACRO STRUCTURING (CLEAN -> HEADLINES TAGGED)
// ============================================================================
// Goal: Identify the Skeleton (Headers) and Footnote References.

export const PROMPT_STEP_1 = (isFirstChunk: boolean, language: string = 'AUTO', previousContext: string = '', lastLevel: number = -1, hierarchyMap: Record<string, number> = {}) => `
You are an Expert Legal Document Analyst and Structural Architect.
**DETECTED LANGUAGE:** ${language === 'AUTO' ? 'DETECT FROM TEXT' : language}.
**STEP 3 GOAL:** Reconstruct the document's structural skeleton using STANDARD MARKDOWN HEADERS ONLY.
**CRITICAL:** OUTPUT THE FULL TEXT VERBATIM. DO NOT SUMMARIZE, DO NOT SKIP ARTICLES, DO NOT CHANGE THE BODY TEXT. IF YOU SKIP EVEN A SINGLE WORD, THE PROCESS WILL FAIL.

${previousContext ? `**PREVIOUS CHUNK CONTEXT:**\nThe previous part of this document ended with the following text and hierarchy:\n"""\n${previousContext}\n"""\n**CRITICAL INSTRUCTION:** You are continuing from the context above. The last active header level was H${lastLevel + 1}. Maintain the exact same hierarchical logic. Do NOT restart the top-level hierarchy unless a genuinely new top-level section begins.` : ''}

${Object.keys(hierarchyMap).length > 0 ? `**GLOBAL HIERARCHY MAP ESTABLISHED:**\nYou MUST strictly follow this mapping for headers based on previous chunks:\n${Object.entries(hierarchyMap).map(([kw, lvl]) => `- "${kw}" MUST ALWAYS be H${lvl + 1}`).join('\n')}\n**CRITICAL:** Do not deviate from this mapping.` : ''}

**TAG FORMATS:** 
1. Headlines: Use STANDARD MARKDOWN HEADERS ONLY (#, ##, ###, etc.). 
   - **CRITICAL:** DO NOT output tags like {{level1}} or {{-level1}}. ONLY use the # symbols at the start of the line.
   - **# (H1):** Top-level division of the document or Document Title (e.g., "# CHAPTER 10 DIGITAL TRADE", "# PART 1", "# TITLE I", "# CONSTITUTION"). This produces {{level0}}.
   - **## (H2):** Primary Articles, Sections, or Clauses under the chapter (e.g., "## Article 10.1: Definitions", "## Section 1. (NEW)", "## Artigo 1º"). This produces {{level1}}.
   - **### (H3), #### (H4):** Secondary sub-headings or subsections if present.
2. Inline Footnote Markers: {{footnotenumber[ID]}}[ID]{{-footnotenumber[ID]}} 
   - [ID] can be a number (1, 2), letter (a, b), or symbol (*, **). Example: {{footnotenumber*}}*{{-footnotenumber*}}
3. Footnote Bodies: {{footnote[ID]}}Footnote Text{{-footnote[ID]}} 
   - Example: {{footnote*}}* This is the footnote text at the bottom.{{-footnote*}}
   - **CRITICAL:** Consolidate all footnote bodies at the very end of the text. Do NOT leave them in the middle of an article.

**RULES FOR DYNAMIC HIERARCHY (CRITICAL):**
1. **DO NOT USE HARDCODED RULES.** You must INTERPRET the document's actual structure based on its content.
2. **PROHIBITION ON FORMATTING:** DO NOT add any bold (**), italic (*), or other markdown formatting to the text. You are ONLY allowed to use the # symbols at the very beginning of the lines for headers. Leave the words exactly as they are.
3. **Top-Level Division (#):** Identify the HIGHEST level of division present in this specific document. 
   - If the document is divided into "Chapters/Parts/Titles" and then "Articles", then "Chapter/Part/Title" MUST be # (H1 -> level0), and "Article/Section" MUST be ## (H2 -> level1).
   - If the document has NO Chapters/Parts and is simply a list of "Articles" or "Sections", then "Article/Section" MUST be ## (H2 -> level1) under the main title # (H1 -> level0).
   - **NEVER** skip levels or make an Article H3 (level2) if its parent Chapter is H1 (level0).
4. **Consolidate Split Headers:** If a header spans multiple lines, merge them into a single Markdown line: # CHAPTER 10 DIGITAL TRADE or ## ARTICLE 1 DEFINITIONS.
5. **SEPARATE INLINE CONTENT FROM HEADERS (CRITICAL):** If a headline (e.g., "Article X (Title)") is on the same line as the body text (e.g., "(1) The state shall..."), you **MUST SPLIT** them into two separate lines. Apply the '#' header ONLY to the title part. The body text must be placed on a new line below it without any '#'.
   - *BAD:* ### Article 24 (Infrastructure) (1) The State shall...
   - *GOOD:* 
     ### Article 24 (Infrastructure)
     (1) The State shall...
6. **Tables:** Treat tables as body text. Do not tag internal table cells as headlines.

**OUTPUT:** Return the full text with Markdown headers and footnote tags applied based on your contextual understanding of the document's outline.
`;
