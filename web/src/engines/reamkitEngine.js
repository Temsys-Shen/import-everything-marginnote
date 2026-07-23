import { Ream } from "reamkit";
import { sanitizeHtml, toParserError } from "../parsers/utils";
import { registerEngine } from "./engineRegistry";

const SUPPORTED_TYPES = [
  "docx",
  "xlsx",
  "xls",
  "csv",
  "pptx",
  "doc",
  "ppt",
];

async function reamkitParserFn(sourceType, file, context) {
  const fileName = file.name || "document";

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = Ream.parse(bytes);

    const rawBytes = await doc.convert("html");
    const fullHtml = new TextDecoder().decode(rawBytes);
    const bodyHtml = extractBodyContent(fullHtml);
    const sanitized = sanitizeHtml(bodyHtml, { mode: "rich-document" });

    const sections = buildSections(sourceType, fileName, sanitized);

    return { sections, warnings: [] };
  } catch (error) {
    throw toParserError({
      parser: "reamkit",
      fileName,
      sourceType,
      detail: error,
    });
  }
}

function extractBodyContent(fullHtml) {
  const match = /<body[^>]*>([\s\S]*)<\/body>/i.exec(fullHtml);
  if (match && match[1]) {
    return match[1].trim();
  }
  return fullHtml;
}

function buildSections(sourceType, fileName, html) {
  const sections = [];
  const title = fileName.replace(/\.[^.]+$/, "");

  if (sourceType === "pptx" || sourceType === "ppt") {
    const slideParts = splitSlides(html, `${fileName} - 幻灯片`);
    for (const part of slideParts) {
      sections.push(part);
    }
    if (sections.length === 0) {
      sections.push({ type: "content", id: null, title: fileName, html, pageBreakBefore: false });
    }
  } else if (sourceType === "xlsx" || sourceType === "xls" || sourceType === "csv") {
    const sheetParts = splitSheets(html, title);
    for (const part of sheetParts) {
      sections.push(part);
    }
    if (sections.length === 0) {
      sections.push({ type: "content", id: null, title: fileName, html, pageBreakBefore: false });
    }
  } else {
    sections.push({ type: "content", id: null, title: fileName, html, pageBreakBefore: false });
  }

  return sections;
}

function splitSlides(html, baseTitle) {
  const parts = [];
  const slideRegex = /<div[^>]*\bslide\b[^>]*>/gi;
  let lastIndex = 0;
  let slideIndex = 0;

  let match = slideRegex.exec(html);
  while (match !== null) {
    if (slideIndex > 0) {
      const segment = html.slice(lastIndex, match.index).trim();
      if (segment) {
        parts.push({
          type: "content",
          id: null,
          title: `${baseTitle} ${slideIndex}`,
          html: segment,
          pageBreakBefore: slideIndex > 1,
        });
      }
    }
    slideIndex += 1;
    lastIndex = match.index;
    match = slideRegex.exec(html);
  }

  const remaining = html.slice(lastIndex).trim();
  if (remaining) {
    parts.push({
      type: "content",
      id: null,
      title: `${baseTitle} ${slideIndex + 1}`,
      html: remaining,
      pageBreakBefore: true,
    });
  }

  return parts;
}

function splitSheets(html, baseTitle) {
  const parts = [];
  const tableRegex = /<table[\s>]/gi;
  let lastIndex = 0;
  let tableIndex = 0;

  let match = tableRegex.exec(html);
  while (match !== null) {
    if (tableIndex > 0) {
      const segment = html.slice(lastIndex, match.index).trim();
      if (segment) {
        parts.push({
          type: "content",
          id: null,
          title: `${baseTitle} - 表${tableIndex}`,
          html: segment,
          pageBreakBefore: tableIndex > 1,
        });
      }
    }
    tableIndex += 1;
    lastIndex = match.index;
    match = tableRegex.exec(html);
  }

  const remaining = html.slice(lastIndex).trim();
  if (remaining) {
    parts.push({
      type: "content",
      id: null,
      title: `${baseTitle} - 表${tableIndex + 1}`,
      html: remaining,
      pageBreakBefore: true,
    });
  }

  if (parts.length === 0) {
    parts.push({
      type: "content",
      id: null,
      title: baseTitle,
      html,
      pageBreakBefore: false,
    });
  }

  return parts;
}

export function registerReamkitEngine() {
  registerEngine({
    engineId: "reamkit",
    label: "ReamKit 引擎",
    description: "纯 TypeScript 实现，支持 .doc/.ppt 等老旧格式，排版保真度更高",
    supportedSourceTypes: SUPPORTED_TYPES,
    parserFn: reamkitParserFn,
  });
}
