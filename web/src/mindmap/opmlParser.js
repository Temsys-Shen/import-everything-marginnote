import { createMindmapImportNode, createMindmapImportSheet, createMindmapImportTree } from "./model";

function getFileBaseName(fileName) {
  return String(fileName || "").replace(/\.[^.]+$/, "").trim() || "OPML脑图";
}

function getElementText(parent, tagName) {
  if (!parent || typeof parent.querySelector !== "function") {
    return "";
  }
  const element = parent.querySelector(tagName);
  return element && typeof element.textContent === "string" ? element.textContent.trim() : "";
}

function getOutlineNodeText(element) {
  if (!element || typeof element.getAttribute !== "function") {
    return "";
  }

  const text = element.getAttribute("text");
  if (typeof text === "string" && text.trim()) {
    return text.trim();
  }

  const title = element.getAttribute("title");
  if (typeof title === "string" && title.trim()) {
    return title.trim();
  }

  return "";
}

function getOutlineNodeComment(element) {
  if (!element || typeof element.getAttribute !== "function") {
    return "";
  }

  const note = element.getAttribute("_note");
  if (typeof note === "string" && note.trim()) {
    return note.trim();
  }

  const fallbackNote = element.getAttribute("note");
  if (typeof fallbackNote === "string" && fallbackNote.trim()) {
    return fallbackNote.trim();
  }

  return "";
}

function getDirectChildOutlines(element) {
  if (!element || !element.children) {
    return [];
  }

  return Array.from(element.children).filter(
    (child) => child && child.tagName && child.tagName.toLowerCase() === "outline",
  );
}

function buildOutlineNode(element) {
  const text = getOutlineNodeText(element);
  if (!text) {
    return null;
  }

  const children = getDirectChildOutlines(element)
    .map((child) => buildOutlineNode(child))
    .filter(Boolean);

  return createMindmapImportNode({
    text,
    children,
    comment: getOutlineNodeComment(element),
    sourceMeta: {
      syntax: "opml-outline",
    },
  });
}

export async function parseOpmlMindmapFile(file) {
  const rawText = await file.text();
  const parser = new DOMParser();
  const document = parser.parseFromString(String(rawText || ""), "text/xml");
  const parserError = document.querySelector("parsererror");
  if (parserError) {
    throw new Error("OPML解析失败: XML格式无效");
  }

  const opml = document.querySelector("opml");
  if (!opml) {
    throw new Error("OPML解析失败: 缺少opml根节点");
  }

  const body = opml.querySelector("body");
  if (!body) {
    throw new Error("OPML解析失败: 缺少body节点");
  }

  const fileBaseName = getFileBaseName(file.name);
  const title = getElementText(opml.querySelector("head"), "title") || fileBaseName;
  const topLevelNodes = getDirectChildOutlines(body)
    .map((child) => buildOutlineNode(child))
    .filter(Boolean);

  if (topLevelNodes.length === 0) {
    throw new Error("OPML中没有找到有效outline节点，无法建立脑图");
  }

  const root = topLevelNodes.length === 1
    ? topLevelNodes[0]
    : createMindmapImportNode({
      text: title,
      children: topLevelNodes,
      sourceMeta: {
        syntax: "opml-virtual-root",
      },
    });

  return createMindmapImportTree({
    sourceType: "opml",
    title,
    sheets: [createMindmapImportSheet({
      id: "opml-root",
      title: root.text || title,
      root,
      sourceMeta: {
        syntax: "opml",
      },
    })],
    sourceMeta: {
      fileName: file.name,
      syntax: "opml",
    },
  });
}
