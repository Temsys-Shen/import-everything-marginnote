import { parseCodeFile } from "./codeParser";
import { parseDocxFile } from "./docxParser";
import { parseEpubFile } from "./epubParser";
import { parseHtmlFile } from "./htmlParser";
import { parseImageFile } from "./imageParser";
import { parseMarkdownFile } from "./markdownParser";
import { parsePptxFile } from "./pptxParser";
import { parseRtfFile } from "./rtfParser";
import { parseSpreadsheetFile } from "./spreadsheetParser";
import { parseTextFile } from "./textParser";

const PARSER_TABLE = {
  docx: parseDocxFile,
  rtf: parseRtfFile,
  spreadsheet: parseSpreadsheetFile,
  pptx: parsePptxFile,
  markdown: parseMarkdownFile,
  html: parseHtmlFile,
  text: parseTextFile,
  image: parseImageFile,
  code: parseCodeFile,
  epub: parseEpubFile,
};

export async function parseBySourceType(sourceType, file, context = {}) {
  const parser = PARSER_TABLE[sourceType];
  if (!parser) {
    throw new Error(`No parser registered for sourceType=${sourceType}`);
  }
  return parser(file, context);
}
