import { renderMarkdownToHtml } from "./markdownEngine";
import { stripMarkdownFrontMatter } from "./markdownFrontMatter";
import { readAsText, toParserError } from "./utils";

export async function parseMarkdownFile(file) {
  try {
    const markdown = await readAsText(file);
    const normalized = stripMarkdownFrontMatter(markdown);
    return {
      sections: [
        {
          title: file.name,
          html: renderMarkdownToHtml(normalized.content),
          pageBreakBefore: true,
        },
      ],
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
