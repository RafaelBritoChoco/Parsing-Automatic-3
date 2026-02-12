
// ============================================================================
// HELPER: LEGAL HEADERS DICTIONARY
// ============================================================================
const getLegalHeaderTerms = (lang: string) => {
    // UNIVERSAL LIST for AUTO mode
    if (lang === 'AUTO') return `
      ANY hierarchical legal header found in the document structure.
      Examples to look for:
      - English: Chapter, Article, Section, Part, Title
      - Vietnamese: Chương, Điều, Mục, Khoản, Phần, Luật số
      - Spanish/Portuguese: Capítulo, Artigo, Artículo, Seção, Título
      - German: Kapitel, Artikel, Paragraph (§)
      - Chinese: 第X章, 条
      - Russian: Глава, Статья
      **INFER THE TERMS FROM THE DOCUMENT'S VISUAL STRUCTURE (Bold/Centered).**
    `;
    
    // Specific Overrides for higher precision
    if (lang === 'VI') return 'CHƯƠNG, MỤC, ĐIỀU, KHOẢN, PHẦN, LUẬT SỐ, QUYẾT ĐỊNH';
    if (lang === 'ZH') return '编, 章, 节, 条, 款, 项, 目';
    if (lang === 'JA') return '編, 章, 節, 条, 項, 号';
    if (lang === 'KO') return '편, 장, 절, 관, 조, 항, 호';
    if (lang === 'RU') return 'РАЗДЕЛ, ГЛАВА, СТАТЬЯ, ЧАСТЬ, ПУНКТ';
    if (lang === 'DE') return 'BUCH, TITEL, KAPITEL, ABSCHNITT, ARTIKEL, PARAGRAPH (§)';
    if (lang === 'FR') return 'LIVRE, TITRE, CHAPITRE, SECTION, ARTICLE';
    if (lang === 'PT' || lang === 'ES') return 'LIVRO/LIBRO, TÍTULO, CAPÍTULO, SEÇÃO/SECCIÓN, ARTIGO/ARTÍCULO';
    
    return 'CHAPTER, SECTION, ARTICLE, PART, TITLE, SCHEDULE, ANNEX';
}

// ============================================================================
// STEP 3: MACRO STRUCTURING (CLEAN -> HEADLINES TAGGED)
// ============================================================================
// Goal: Identify the Skeleton (Headers) and Footnote References.

export const PROMPT_STEP_1 = (isFirstChunk: boolean, language: string = 'AUTO') => `
You are a Structural Analyst for a legal document.
**DETECTED LANGUAGE:** ${language === 'AUTO' ? 'DETECT FROM TEXT' : language}.
**STEP 3 GOAL:** Identify and tag structural headlines AND inline footnote markers.
**CRITICAL:** OUTPUT THE FULL TEXT VERBATIM. DO NOT SUMMARIZE.

**TAG FORMATS:** 
1. Headlines: {{levelN}}Headline Text{{-levelN}} (N >= 0)
2. Inline Footnote Markers: {{footnotenumberN}}N{{-footnotenumberN}}
3. Footnote Bodies: {{footnoteN}}Footnote Text{{-footnoteN}}

**RULES:**
1. **Headlines:** Tag the Structural skeleton of the document.
   - **Look for keywords:** ${getLegalHeaderTerms(language)}
   - **Universal Rule:** If the document uses a consistent pattern for division (e.g., Bold text starting with a Number, or Centered Uppercase text), treat it as a Header.
   - **HIERARCHY (0 -> 1 -> 2):**
     - **Level 0 (Doc Title):** The main title (e.g. "LUẬT AN NINH MẠNG", "CONSTITUTION"). Only in first chunk.
     - **Level 1:** Major divisions (Part, Book, Title, Chương, 编, Раздел).
     - **Level 2:** Minor divisions (Article, Section, Điều, 条, Статья).
     - **Level 3+:** Sub-divisions (Paragraphs with headers, Khoản).
     - **STRICT SEQUENTIAL RULE:** Start at the highest level found (e.g. 1) and go down.
   - **MERGING:** If "CHAPTER 1" is on one line and "THE TITLE" is on the next, MERGE them: {{level1}}CHAPTER 1 THE TITLE{{-level1}}.

2. **Inline Markers:** Scan the BODY text for numbers acting as references (e.g., "word1" or "term(2)"). Wrap them.
3. **Footnote Bodies:** Identify footnotes at the bottom of pages.
4. **Tables:** Treat tables as Body Text (do not tag internals as headlines).

**OUTPUT:** Return full text with headlines and footnote markers tagged.
`;
