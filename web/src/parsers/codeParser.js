import { resolveCodeLanguage } from "../pipeline/fileTypes";
import { renderMarkdownToHtml } from "./markdownEngine";
import { readAsText, toParserError } from "./utils";

export async function parseCodeFile(file) {
  try {
    const codeText = await readAsText(file);
    const language = resolveCodeLanguage(file.name);
    const markdown = `\n\n\`\`\`${language}\n${codeText}\n\`\`\``;

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
      parser: "parseCodeFile",
      fileName: file.name,
      sourceType: "code",
      detail: error,
    });
  }
}
