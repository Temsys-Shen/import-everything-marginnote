import JSZip from "jszip";
import { readAsArrayBuffer, sanitizeHtml, escapeHtml, toParserError } from "./utils";

const OPENXML_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function parseXml(xmlText, context) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, "application/xml");
  const parserError = xml.querySelector("parsererror");
  if (parserError) {
    throw new Error(`Invalid XML in ${context}`);
  }
  return xml;
}

function normalizePath(baseDir, target) {
  const merged = `${baseDir}/${target}`.replaceAll("\\", "/");
  const parts = merged.split("/");
  const stack = [];

  parts.forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") {
      stack.pop();
      return;
    }
    stack.push(part);
  });

  return stack.join("/");
}

function extensionToMime(filePath) {
  const ext = filePath.toLowerCase().split(".").pop();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "bmp") return "image/bmp";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "webp") return "image/webp";
  return "application/octet-stream";
}

function getSlideIdNodes(presentationXml) {
  return Array.from(presentationXml.getElementsByTagNameNS("*", "sldId"));
}

function buildRelationshipsMap(relsXml) {
  const relationshipNodes = Array.from(relsXml.getElementsByTagName("Relationship"));
  const map = new Map();

  relationshipNodes.forEach((node) => {
    const id = node.getAttribute("Id");
    const target = node.getAttribute("Target");
    if (id && target) {
      map.set(id, target);
    }
  });

  return map;
}

function extractSlideTexts(slideXml) {
  const textNodes = Array.from(slideXml.getElementsByTagNameNS("*", "t"));
  return textNodes
    .map((node) => (node.textContent || "").trim())
    .filter(Boolean);
}

async function extractSlideImages(zip, slidePath, slideXml) {
  const slideDir = slidePath.split("/").slice(0, -1).join("/");
  const relsPath = `${slideDir}/_rels/${slidePath.split("/").pop()}.rels`;
  const relsFile = zip.file(relsPath);
  if (!relsFile) {
    return [];
  }

  const relsXml = parseXml(await relsFile.async("text"), relsPath);
  const relsMap = buildRelationshipsMap(relsXml);
  const blipNodes = Array.from(slideXml.getElementsByTagNameNS("*", "blip"));
  const imageHtmlList = [];

  for (let i = 0; i < blipNodes.length; i += 1) {
    const node = blipNodes[i];
    const relId = node.getAttributeNS(OPENXML_REL_NS, "embed") || node.getAttribute("r:embed");
    if (!relId || !relsMap.has(relId)) {
      continue;
    }

    const mediaPath = normalizePath(slideDir, relsMap.get(relId));
    const mediaFile = zip.file(mediaPath);
    if (!mediaFile) {
      continue;
    }

    const base64 = await mediaFile.async("base64");
    const mime = extensionToMime(mediaPath);
    imageHtmlList.push(`<img src="data:${mime};base64,${base64}" alt="slide-media-${i + 1}" />`);
  }

  return imageHtmlList;
}

export async function parsePptxFile(file, context = {}) {
  try {
    const { onProgress } = context;
    const arrayBuffer = await readAsArrayBuffer(file);
    const zip = await JSZip.loadAsync(arrayBuffer);

    const presentationFile = zip.file("ppt/presentation.xml");
    const relsFile = zip.file("ppt/_rels/presentation.xml.rels");
    if (!presentationFile || !relsFile) {
      throw new Error("Missing presentation XML relationships");
    }

    const presentationXml = parseXml(await presentationFile.async("text"), "ppt/presentation.xml");
    const presentationRelsXml = parseXml(await relsFile.async("text"), "ppt/_rels/presentation.xml.rels");
    const relsMap = buildRelationshipsMap(presentationRelsXml);
    const slideNodes = getSlideIdNodes(presentationXml);

    if (slideNodes.length === 0) {
      throw new Error("No slides found in presentation.xml");
    }

    const sections = [];

    for (let i = 0; i < slideNodes.length; i += 1) {
      if (typeof onProgress === "function") {
        onProgress({ stage: "parse-pptx", current: i + 1, total: slideNodes.length });
      }

      const node = slideNodes[i];
      const relId = node.getAttributeNS(OPENXML_REL_NS, "id") || node.getAttribute("r:id");
      if (!relId || !relsMap.has(relId)) {
        throw new Error(`Slide relation missing for r:id=${relId || "unknown"}`);
      }

      const slideTarget = relsMap.get(relId);
      const slidePath = normalizePath("ppt", slideTarget);
      const slideFile = zip.file(slidePath);
      if (!slideFile) {
        throw new Error(`Missing slide XML: ${slidePath}`);
      }

      const slideXml = parseXml(await slideFile.async("text"), slidePath);
      const slideTexts = extractSlideTexts(slideXml);
      const slideImages = await extractSlideImages(zip, slidePath, slideXml);
      const paragraphHtml = slideTexts.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n");
      const imageHtml = slideImages.length > 0 ? `<div class="slide-images">${slideImages.join("\n")}</div>` : "";
      const fallbackHtml = paragraphHtml || imageHtml || "<p>(Empty slide)</p>";

      sections.push({
        title: `${file.name} - Slide ${i + 1}`,
        html: sanitizeHtml(`<article class="slide-article">${fallbackHtml}</article>`),
        pageBreakBefore: i === 0,
      });
    }

    return { sections };
  } catch (error) {
    throw toParserError({
      parser: "parsePptxFile",
      fileName: file.name,
      sourceType: "pptx",
      detail: error,
    });
  }
}
