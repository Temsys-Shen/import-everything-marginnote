import JSZip from "jszip";
import { createMindmapImportNode, createMindmapImportSheet, createMindmapImportTree } from "./model";
import {
  findZipEntryByBaseName,
  getDirectChildElementsByName,
  getElementText,
  getFileBaseName,
  getFirstDirectChildByName,
  getFirstDescendantByName,
  getTrimmedAttribute,
  parseXmlDocument,
} from "./xmlMindmapUtils";

function getTopicText(topicElement) {
  const directTextElement = getFirstDirectChildByName(topicElement, "text");
  if (directTextElement) {
    const directText = getElementText(directTextElement);
    if (directText) {
      return directText;
    }
  }

  return getTrimmedAttribute(topicElement, ["text", "title"]);
}

function getTopicComment(topicElement) {
  const sections = [];
  const noteElements = getDirectChildElementsByName(topicElement, "note");
  noteElements.forEach((element) => {
    const text = getElementText(element);
    if (text) {
      sections.push(text);
    }
  });

  const childrenContainer = getFirstDirectChildByName(topicElement, "children");
  const outerTextContainer = childrenContainer ? getFirstDirectChildByName(childrenContainer, "text") : null;
  const outerNoteElements = outerTextContainer ? getDirectChildElementsByName(outerTextContainer, "note") : [];
  outerNoteElements.forEach((element) => {
    const text = getElementText(element);
    if (text) {
      sections.push(text);
    }
  });

  return sections.join("\n\n").trim();
}

function getDirectChildTopics(topicElement) {
  const childrenContainer = getFirstDirectChildByName(topicElement, "children");
  if (!childrenContainer) {
    return [];
  }

  const topicsContainer = getFirstDirectChildByName(childrenContainer, "topics");
  if (!topicsContainer) {
    return [];
  }

  return getDirectChildElementsByName(topicsContainer, "topic");
}

function buildTopicNode(topicElement) {
  const text = getTopicText(topicElement);
  if (!text) {
    return null;
  }

  const children = getDirectChildTopics(topicElement)
    .map((child) => buildTopicNode(child))
    .filter(Boolean);

  return createMindmapImportNode({
    id: getTrimmedAttribute(topicElement, "id") || undefined,
    text,
    children,
    comment: getTopicComment(topicElement),
    sourceMeta: {
      syntax: "simplemind-topic",
    },
  });
}

export async function parseSimpleMindFile(file) {
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (error) {
    throw new Error(`SimpleMind压缩包解析失败: ${error && error.message ? error.message : String(error)}`);
  }

  const entryNames = Object.keys(zip.files).sort((left, right) => left.localeCompare(right, "en"));
  const documentEntry = findZipEntryByBaseName(entryNames, "document/mindmap.xml");
  if (!documentEntry) {
    throw new Error("SimpleMind文件中未找到document/mindmap.xml");
  }

  let rawText = "";
  try {
    rawText = await zip.files[documentEntry].async("string");
  } catch (error) {
    throw new Error(`mindmap.xml解析失败: ${error && error.message ? error.message : String(error)}`);
  }

  const document = parseXmlDocument(rawText, "SimpleMind");
  const mindmapElement = getFirstDescendantByName(document, "mindmap");
  if (!mindmapElement) {
    throw new Error("SimpleMind解析失败: 缺少mindmap根节点");
  }

  const topicsElement = getFirstDirectChildByName(mindmapElement, "topics");
  if (!topicsElement) {
    throw new Error("SimpleMind解析失败: 缺少topics节点");
  }

  const topLevelNodes = getDirectChildElementsByName(topicsElement, "topic")
    .map((child) => buildTopicNode(child))
    .filter(Boolean);

  if (topLevelNodes.length === 0) {
    throw new Error("SimpleMind中没有找到有效topic节点，无法建立脑图");
  }

  const fileBaseName = getFileBaseName(file.name, "SimpleMind脑图");
  const root = topLevelNodes.length === 1
    ? topLevelNodes[0]
    : createMindmapImportNode({
      text: fileBaseName,
      children: topLevelNodes,
      sourceMeta: {
        syntax: "simplemind-virtual-root",
      },
    });

  return createMindmapImportTree({
    sourceType: "simplemind",
    title: root.text || fileBaseName,
    sheets: [createMindmapImportSheet({
      id: "simplemind-root",
      title: root.text || fileBaseName,
      root,
      sourceMeta: {
        syntax: "simplemind",
      },
    })],
    sourceMeta: {
      fileName: file.name,
      syntax: "simplemind",
      container: "zip",
      documentEntry,
    },
  });
}
