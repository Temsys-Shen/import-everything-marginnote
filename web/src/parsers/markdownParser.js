import { renderMarkdownToHtml } from "./markdownEngine";
import { stripMarkdownFrontMatter } from "./markdownFrontMatter";
import { normalizeBulletIndentation } from "./normalizeBulletIndentation";
import { readAsText, toParserError } from "./utils";

function splitIntoSections(markdown, fileName) {
  const sections = [];
  const h1Regex = /^#\s+(.+)$/gm;
  const matches = [];
  let match;

  while ((match = h1Regex.exec(markdown)) !== null) {
    matches.push({
      title: match[1].trim(),
      index: match.index,
    });
  }

  if (matches.length === 0) {
    sections.push({
      title: fileName,
      html: renderMarkdownToHtml(markdown),
      pageBreakBefore: true,
    });
    return sections;
  }

  // Content before first h1
  if (matches[0].index > 0) {
    const before = markdown.slice(0, matches[0].index).trim();
    if (before) {
      sections.push({
        title: fileName,
        html: renderMarkdownToHtml(before),
        pageBreakBefore: true,
      });
    }
  }

  // Each h1 section
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : markdown.length;
    const content = markdown.slice(start, end).trim();
    if (content) {
      sections.push({
        title: matches[i].title,
        html: renderMarkdownToHtml(content),
        pageBreakBefore: true,
      });
    }
  }

  return sections;
}

export async function parseMarkdownFile(file) {
  try {
    const markdown = await readAsText(file);
    const normalized = stripMarkdownFrontMatter(markdown);
    const content = normalizeBulletIndentation(normalized.content);
    return {
      sections: splitIntoSections(content, file.name),
    };
  } catch (error) {
    throw toParserError({
      parser: "parseMarkdownFile",
      fileName: file.name,
      sourceType: "markdown",
      detail: error,
    });
  }
}
