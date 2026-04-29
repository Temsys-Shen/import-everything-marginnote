import { createMindmapImportNode, createMindmapImportSheet, createMindmapImportTree } from "./model";

function getFileBaseName(fileName) {
  return String(fileName || "").replace(/\.[^.]+$/, "").trim() || "FreeMind脑图";
}

function getTextContentFromElement(element) {
  return element && typeof element.textContent === "string" ? element.textContent.trim() : "";
}

function getRichContentText(nodeElement, type) {
  if (!nodeElement || !nodeElement.children) {
    return "";
  }

  const richContentElements = Array.from(nodeElement.children).filter(
    (child) => child && child.tagName && child.tagName.toLowerCase() === "richcontent",
  );
  const target = richContentElements.find((element) => {
    const richType = element.getAttribute("TYPE") || element.getAttribute("type");
    return String(richType || "").toUpperCase() === type;
  });

  if (!target) {
    return "";
  }

  const body = target.querySelector("body");
  return getTextContentFromElement(body || target);
}

function getDirectChildNodes(element) {
  if (!element || !element.children) {
    return [];
  }

  return Array.from(element.children).filter(
    (child) => child && child.tagName && child.tagName.toLowerCase() === "node",
  );
}

function getNodeText(nodeElement) {
  if (!nodeElement || typeof nodeElement.getAttribute !== "function") {
    return "";
  }

  const text = nodeElement.getAttribute("TEXT") || nodeElement.getAttribute("text");
  if (typeof text === "string" && text.trim()) {
    return text.trim();
  }

  return getRichContentText(nodeElement, "NODE");
}

function getNodeComment(nodeElement) {
  return getRichContentText(nodeElement, "NOTE");
}

function buildNode(nodeElement) {
  const text = getNodeText(nodeElement);
  if (!text) {
    return null;
  }

  const children = getDirectChildNodes(nodeElement)
    .map((child) => buildNode(child))
    .filter(Boolean);
  const rawId = nodeElement.getAttribute("ID") || nodeElement.getAttribute("id");

  return createMindmapImportNode({
    id: typeof rawId === "string" && rawId.trim() ? rawId.trim() : undefined,
    text,
    children,
    comment: getNodeComment(nodeElement),
    sourceMeta: {
      syntax: "freemind-node",
      folded: String(nodeElement.getAttribute("FOLDED") || nodeElement.getAttribute("folded") || "").toLowerCase() === "true",
    },
  });
}

export async function parseFreeMindFile(file) {
  const rawText = await file.text();
  const parser = new DOMParser();
  const document = parser.parseFromString(String(rawText || ""), "text/xml");
  const parserError = document.querySelector("parsererror");
  if (parserError) {
    throw new Error("FreeMind解析失败: XML格式无效");
  }

  const map = document.querySelector("map");
  if (!map) {
    throw new Error("FreeMind解析失败: 缺少map根节点");
  }

  const fileBaseName = getFileBaseName(file.name);
  const topLevelNodes = getDirectChildNodes(map)
    .map((child) => buildNode(child))
    .filter(Boolean);

  if (topLevelNodes.length === 0) {
    throw new Error("FreeMind中没有找到有效node节点，无法建立脑图");
  }

  const root = topLevelNodes.length === 1
    ? topLevelNodes[0]
    : createMindmapImportNode({
      text: fileBaseName,
      children: topLevelNodes,
      sourceMeta: {
        syntax: "freemind-virtual-root",
      },
    });

  return createMindmapImportTree({
    sourceType: "freemind",
    title: root.text || fileBaseName,
    sheets: [createMindmapImportSheet({
      id: "freemind-root",
      title: root.text || fileBaseName,
      root,
      sourceMeta: {
        syntax: "freemind",
      },
    })],
    sourceMeta: {
      fileName: file.name,
      syntax: "freemind",
      mapVersion: String(map.getAttribute("version") || "").trim(),
    },
  });
}
