import { parseCodeFile } from "../parsers/codeParser";
import { parseDocxFile } from "../parsers/docxParser";
import { parseEpubFile } from "../parsers/epubParser";
import { parseHtmlFile } from "../parsers/htmlParser";
import { parseImageFile } from "../parsers/imageParser";
import { parseMarkdownFile } from "../parsers/markdownParser";
import { parsePptxFile } from "../parsers/pptxParser";
import { parseRtfFile } from "../parsers/rtfParser";
import { parseSpreadsheetFile } from "../parsers/spreadsheetParser";
import { parseTextFile } from "../parsers/textParser";
import { registerEngine } from "./engineRegistry";

const LEGACY_PARSER_TABLE = {
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

const SUPPORTED_TYPES = Object.keys(LEGACY_PARSER_TABLE);

async function legacyParserFn(sourceType, file, context) {
  const parser = LEGACY_PARSER_TABLE[sourceType];
  if (!parser) {
    throw new Error(`[legacy-js] No parser for sourceType=${sourceType}`);
  }
  return parser(file, context);
}

export function registerLegacyJsEngine() {
  registerEngine({
    engineId: "legacy-js",
    label: "内置引擎",
    description: "基于 docx-preview、xlsx、@jvmr/pptx-to-html 的纯前端方案",
    supportedSourceTypes: SUPPORTED_TYPES,
    parserFn: legacyParserFn,
  });
}
