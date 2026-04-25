import { renderPlainPreformatted } from "./markdownEngine";
import { readAsText, toParserError } from "./utils";

export async function parseTextFile(file) {
  try {
    const text = await readAsText(file);
    return {
      sections: [
        {
          title: file.name,
          html: renderPlainPreformatted(text),
          pageBreakBefore: true,
        },
      ],
    };
  } catch (error) {
    throw toParserError({
      parser: "parseTextFile",
      fileName: file.name,
      sourceType: "text",
      detail: error,
    });
  }
}
