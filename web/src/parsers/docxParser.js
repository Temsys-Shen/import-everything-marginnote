import mammoth from "mammoth";
import { readAsArrayBuffer, sanitizeHtml, toParserError } from "./utils";

export async function parseDocxFile(file) {
  try {
    const arrayBuffer = await readAsArrayBuffer(file);
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const warnings = result.messages
      .filter((msg) => msg.type === "warning")
      .map((msg) => msg.message);

    return {
      sections: [
        {
          title: file.name,
          html: sanitizeHtml(result.value || ""),
          pageBreakBefore: true,
        },
      ],
      warnings,
    };
  } catch (error) {
    throw toParserError({
      parser: "parseDocxFile",
      fileName: file.name,
      sourceType: "docx",
      detail: error,
    });
  }
}
