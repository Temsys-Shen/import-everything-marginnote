import ePub from "epubjs";
import { readAsArrayBuffer, sanitizeHtml, toParserError } from "./utils";

function flattenToc(tocItems = [], target = []) {
  tocItems.forEach((item) => {
    target.push(item);
    if (item.subitems && item.subitems.length > 0) {
      flattenToc(item.subitems, target);
    }
  });
  return target;
}

function pickBodyHtml(rawHtml) {
  const parser = new DOMParser();
  const document = parser.parseFromString(rawHtml, "text/html");
  return document.body ? document.body.innerHTML : rawHtml;
}

export async function parseEpubFile(file, context = {}) {
  try {
    const { onProgress } = context;
    const arrayBuffer = await readAsArrayBuffer(file);
    const book = ePub(arrayBuffer);

    await book.ready;
    const [navigation] = await Promise.all([book.loaded.navigation, book.loaded.spine]);

    const tocEntries = flattenToc(navigation && navigation.toc ? navigation.toc : []);
    const tocByHref = new Map();
    tocEntries.forEach((entry) => {
      if (entry.href) {
        tocByHref.set(entry.href.split("#")[0], entry.label || entry.href);
      }
    });

    const spineItems = (book.spine && book.spine.spineItems) || [];
    const sections = [];

    for (let i = 0; i < spineItems.length; i += 1) {
      const section = spineItems[i];
      if (section.linear === false) {
        continue;
      }

      if (typeof onProgress === "function") {
        onProgress({ stage: "parse-epub", current: i + 1, total: spineItems.length });
      }

      const rendered = await section.render(book.load.bind(book));
      const bodyHtml = pickBodyHtml(String(rendered || ""));
      const tocTitle = tocByHref.get((section.href || "").split("#")[0]);

      sections.push({
        title: tocTitle || section.href || `Chapter ${sections.length + 1}`,
        html: sanitizeHtml(bodyHtml),
        pageBreakBefore: sections.length === 0,
      });
    }

    if (sections.length === 0) {
      throw new Error("EPUB spine has no renderable sections");
    }

    book.destroy();
    return { sections };
  } catch (error) {
    throw toParserError({
      parser: "parseEpubFile",
      fileName: file.name,
      sourceType: "epub",
      detail: error,
    });
  }
}
