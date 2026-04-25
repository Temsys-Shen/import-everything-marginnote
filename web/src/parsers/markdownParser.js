import { renderMarkdownToHtml } from "./markdownEngine";
import { readAsText, toParserError } from "./utils";

export async function parseMarkdownFile(file) {
  try {
    const markdown = await readAsText(file);
    return {
      sections: [
        {
          title: file.name,
          html: renderMarkdownToHtml(markdown),
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
