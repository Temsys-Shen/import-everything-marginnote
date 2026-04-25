import { readAsText, sanitizeHtml, toParserError } from "./utils";

export async function parseHtmlFile(file) {
  try {
    const htmlText = await readAsText(file);
    return {
      sections: [
        {
          title: file.name,
          html: sanitizeHtml(htmlText),
          pageBreakBefore: true,
        },
      ],
    };
  } catch (error) {
    throw toParserError({
      parser: "parseHtmlFile",
      fileName: file.name,
      sourceType: "html",
      detail: error,
    });
  }
}
