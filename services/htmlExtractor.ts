export const extractTextFromHtml = async (file: File): Promise<string> => {
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');

  // Remove scripts, styles, and other non-content elements
  const toRemove = doc.querySelectorAll('script, style, link, meta, noscript, svg, path, object, iframe, button, input, select, textarea');
  toRemove.forEach(el => el.remove());

  // Function to determine if an element is a block element that forces a line break
  const isBlock = (tagName: string) => {
    return [
        'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
        'li', 'article', 'section', 'nav', 'aside', 'header', 'footer', 
        'tr', 'blockquote', 'table', 'ul', 'ol'
    ].includes(tagName);
  };

  let output = '';

  const traverse = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      // Normalize internal whitespace but keep content
      // We don't trim here because leading spaces might separate words from previous tags
      const content = node.textContent?.replace(/[\r\n\t]+/g, ' '); 
      if (content) output += content;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tagName = el.tagName.toLowerCase();
      
      const isBlockEl = isBlock(tagName);
      const isBr = tagName === 'br';
      
      // Structural Logic: Add newlines around blocks to simulate document layout
      if (isBlockEl) output += '\n';
      
      // Traverse children
      node.childNodes.forEach(traverse);

      if (isBlockEl) output += '\n';
      if (isBr) output += '\n';
    }
  };

  traverse(doc.body || doc.documentElement);

  // Post-processing to clean up layout
  // 1. Collapse multiple spaces to one
  // 2. Remove spaces at start/end of lines
  // 3. Limit max newlines to 2 (Paragraphs)
  return output
    .replace(/[ \t]+/g, ' ') 
    .replace(/\n\s+/g, '\n') 
    .replace(/\s+\n/g, '\n') 
    .replace(/\n{3,}/g, '\n\n') 
    .trim();
};