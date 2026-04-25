import { renderAsync } from "docx-preview";
import { readAsArrayBuffer, sanitizeHtml, toParserError } from "./utils";

const DOCX_RENDER_OPTIONS = {
  className: "mn-import-docx",
  inWrapper: true,
  hideWrapperOnPrint: false,
  ignoreWidth: false,
  ignoreHeight: false,
  ignoreFonts: false,
  breakPages: true,
  ignoreLastRenderedPageBreak: false,
  useBase64URL: true,
  renderChanges: false,
  renderHeaders: true,
  renderFooters: true,
  renderFootnotes: true,
  renderEndnotes: true,
  renderComments: false,
  renderAltChunks: true,
  trimXmlDeclaration: true,
  experimental: true,
  debug: false,
};

async function renderDocxHtml(arrayBuffer) {
  const container = document.createElement("div");
  await renderAsync(arrayBuffer, container, container, DOCX_RENDER_OPTIONS);
  return container.innerHTML;
}

export async function parseDocxFile(file) {
  try {
    const arrayBuffer = await readAsArrayBuffer(file);
    const renderedHtml = await renderDocxHtml(arrayBuffer);

    if (!renderedHtml.trim()) {
      throw new Error("No renderable HTML was produced from the DOCX file");
    }

    return {
      sections: [
        {
          title: file.name,
          html: sanitizeHtml(renderedHtml, {
            mode: "rich-document",
          }),
          pageBreakBefore: true,
        },
      ],
      warnings: [],
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
