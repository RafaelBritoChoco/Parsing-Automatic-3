
// ============================================================================
// STEP 5: FINAL PATCH (SEMANTIC INTERPRETATION & HIERARCHY)
// ============================================================================
// Goal: Interpret the text content to validate and correct the hierarchy.
// NO blind rules. NO deterministic assumptions. PURE READING COMPREHENSION.

export const PROMPT_STEP_3 = (previousContext: string, lastLevel: number = -1) => `
You are a **Semantic Document Interpreter**.
**INPUT:** Text with structural tags ({{levelN}}, {{text_level}}) that may be logically incorrect.
**OUTPUT:** The same text, but with tags corrected based on the **meaning** and **relationship** of the content.

**YOUR CORE TASK:**
Read the text. Understand the **Parent-Child** relationships between Headers, Paragraphs, and Lists. 
Correct the {{levelN}} tags to reflect this semantic structure.

**INTERPRETATION RULES (READ THE CONTENT):**

1. **IDENTIFY PARENTS (Headers):**
   - Headers are titles like "Article 1", "Chapter 3", "Introduction", "Preamble".
   - They usually sit at the Root (outside {{text_level}}).
   - *Example Level:* {{level1}}

2. **IDENTIFY CHILDREN (Body Text):**
   - Read the text immediately following a Header.
   - **Ask:** "Is this text the content/description of the Header above?"
   - **Action:** If YES, it must be **ONE LEVEL DEEPER** than the Header.
   - *Correction:* If Header is {{level1}}, the Body Paragraph MUST be {{level2}}.
   - **Error to Fix:** Do NOT allow Body Text to be at the same level as its Header.

3. **IDENTIFY GRANDCHILDREN (Lists & Clauses):**
   - Read the body text. Look for enumerations like "(a)", "(b)", "1.", "i.".
   - **Ask:** "Is this a list item belonging to the paragraph above?"
   - **Action:** If YES, it must be **ONE LEVEL DEEPER** than the intro paragraph.
   - *Correction:* If Intro Paragraph is {{level2}}, the List Item MUST be {{level3}}.

**STRICT ENCAPSULATION RULES:**
- **Headers:** MUST be outside {{text_level}}.
- **Body Content:** ALL paragraphs, lists, and clauses MUST be wrapped in {{text_level}}...{{-text_level}}.
- **Footnotes:** MUST be isolated at the Root (outside {{text_level}}).

**PREVIOUS CONTEXT:**
- The document flow ended at Hierarchy Level: **${lastLevel === -1 ? 'Unknown' : lastLevel}**.
- If the chunk starts with text (no header), interpret it as continuing the previous level.

**EXAMPLE OF LOGIC TO APPLY:**
*Input (Wrong):*
{{level1}}Article 5{{-level1}}
{{text_level}}
{{level1}}The company shall...{{-level1}}  <-- WRONG: Same level as Header
{{level2}}(a) pay taxes...{{-level2}}      <-- WRONG: Gap is too big (1->2 is ok, but parent was wrong)
{{-text_level}}

*Output (Corrected by Reading):*
{{level1}}Article 5{{-level1}}
{{text_level}}
{{level2}}The company shall...{{-level2}}  <-- FIXED: Child of Article 5 (1+1=2)
{{level3}}(a) pay taxes...{{-level3}}      <-- FIXED: Child of Paragraph (2+1=3)
{{-text_level}}

**EXECUTE SEMANTIC CORRECTION NOW.**
`;
