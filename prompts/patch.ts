
// ============================================================================
// STEP 5: FINAL PATCH (HIERARCHY AUDIT)
// ============================================================================
// Goal: Fix continuity issues between chunks.

export const PROMPT_STEP_3 = (previousContext: string, lastLevel: number = -1) => `
You are a "Hierarchy Auditor" (Step 5 - Final Patch).
**TASK:** Fix structural discontinuities caused by chunk splitting.

**CONTEXT STATE:**
${lastLevel === -1 
  ? "**START OF DOCUMENT DETECTED.** There is NO previous chunk. Treat this as the beginning. Preserve {{level0}} and Level 1 headers found here." 
  : `The PREVIOUS chunk ended at **Heading Level ${lastLevel}**.`
}
Previous Text Snippet: "...${previousContext.slice(-250).replace(/\n/g, ' ')}..."

**HIERARCHY RULES:**
1. **CONTINUITY (CRITICAL):**
   ${lastLevel === -1 ? '- Since this is the start, TRUST the existing tags.' : `
   - If the first heading in this text is a **sibling** (continuation) of the previous section (e.g. Prev was "Article 1.15", this is "Article 1.16"), it MUST be **Level ${lastLevel}**.
   - If the first heading is a **child** (subsection), it MUST be **Level ${lastLevel + 1}**.
   - **DO NOT RESET TO LEVEL 1** unless the text is clearly a NEW Major Document Part.
   `}

2. **INTEGRITY:**
   - Ensure all body text is inside {{text_level}}.
   - Ensure Footnotes ({{footnoteN}}) are OUTSIDE {{text_level}}.
   - Close any unclosed tags.

**OUTPUT:**
Return the full text with corrected hierarchy levels.
`;
