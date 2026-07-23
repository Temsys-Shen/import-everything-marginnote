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

import { parseWithEngine, getDefaultEngineId } from "../engines/engineRegistry";

const PARSER_TABLE = {
  docx: parseDocxFile,
  xlsx: parseSpreadsheetFile,
  xls: parseSpreadsheetFile,
  csv: parseSpreadsheetFile,
  pptx: parsePptxFile,
  rtf: parseRtfFile,
  markdown: parseMarkdownFile,
  html: parseHtmlFile,
  text: parseTextFile,
  image: parseImageFile,
  code: parseCodeFile,
  epub: parseEpubFile,
};

export async function parseBySourceType(sourceType, file, context = {}) {
  const engineId = context.engineId || getDefaultEngineId(sourceType);
  if (engineId) {
    return parseWithEngine(engineId, sourceType, file, context);
  }
  const parser = PARSER_TABLE[sourceType];
  if (!parser) {
    throw new Error(`No parser registered for sourceType=${sourceType}`);
  }
  return parser(file, context);
}
