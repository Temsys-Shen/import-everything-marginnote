import { RTFJS } from "rtf.js";
import { readAsArrayBuffer, sanitizeHtml, toParserError } from "./utils";

export async function parseRtfFile(file) {
  try {
    const arrayBuffer = await readAsArrayBuffer(file);
    const document = new RTFJS.Document(arrayBuffer, {});
    const parts = await document.render();
    const html = parts
      .map((node) => {
        if (node && typeof node.outerHTML === "string") {
          return node.outerHTML;
        }
        return "";
      })
      .join("\n");

    return {
      sections: [
        {
          title: file.name,
          html: sanitizeHtml(html),
          pageBreakBefore: true,
        },
      ],
    };
  } catch (error) {
    throw toParserError({
      parser: "parseRtfFile",
      fileName: file.name,
      sourceType: "rtf",
      detail: error,
    });
  }
}
