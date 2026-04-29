import JSZip from "jszip";
import { createMindmapImportNode, createMindmapImportSheet, createMindmapImportTree } from "./model";
import {
  findZipEntryByBaseName,
  getDirectChildElements,
  getDirectChildElementsByName,
  getElementText,
  getFileBaseName,
  getFirstDescendantByName,
  getLocalName,
  getTrimmedAttribute,
  parseXmlDocument,
} from "./xmlMindmapUtils";

function isTopicElement(element) {
  const localName = getLocalName(element);
  return localName === "topic" || localName === "onetopic";
}

function collectDirectChildTopics(element) {
  const children = getDirectChildElements(element);
  const directTopics = [];

  children.forEach((child) => {
    if (isTopicElement(child) && getLocalName(child) === "topic") {
      directTopics.push(child);
      return;
    }

    const localName = getLocalName(child);
    if (localName === "subtopics" || localName === "onetopic" || localName === "topics") {
      getDirectChildElements(child).forEach((nested) => {
        if (isTopicElement(nested) && getLocalName(nested) === "topic") {
          directTopics.push(nested);
        }
      });
    }
  });

  return directTopics;
}

function extractTopicText(topicElement) {
  const textElement = getDirectChildElementsByName(topicElement, "text")[0] || null;
  const attrCandidates = [
    getTrimmedAttribute(textElement, ["PlainText", "plainText", "plain-text", "Text", "text"]),
    getTrimmedAttribute(topicElement, ["PlainText", "plainText", "GenText", "Text", "text"]),
  ].filter(Boolean);

  if (attrCandidates[0]) {
    return attrCandidates[0];
  }
  if (textElement) {
    return getElementText(textElement);
  }
  return "";
}

function extractTopicComment(topicElement) {
  const notesGroup = getDirectChildElementsByName(topicElement, ["notesgroup", "notes"])[0] || null;
  if (!notesGroup) {
    return "";
  }

  const previewSources = [
    getFirstDescendantByName(notesGroup, ["notesxhtmldata", "xhtmldata"]),
    getFirstDescendantByName(notesGroup, ["notesdata", "note"]),
  ].filter(Boolean);

  for (const source of previewSources) {
    const previewText = getTrimmedAttribute(source, ["PreviewPlainText", "previewPlainText", "plainText", "Text", "text"]);
    if (previewText) {
      return previewText;
    }
    const text = getElementText(source);
    if (text) {
      return text;
    }
  }

  return getElementText(notesGroup);
}

function toMindManagerNode(topicElement) {
  const text = extractTopicText(topicElement);
  if (!text) {
    return null;
  }

  const children = collectDirectChildTopics(topicElement)
    .map((child) => toMindManagerNode(child))
    .filter(Boolean);

  return createMindmapImportNode({
    id: getTrimmedAttribute(topicElement, ["OId", "OID", "id", "Id"]) || undefined,
    text,
    children,
    comment: extractTopicComment(topicElement),
    sourceMeta: {
      syntax: "mindmanager-topic",
    },
  });
}

function buildMindManagerTree(document, fileName, sourceMeta) {
  const mapRoot = getFirstDescendantByName(document, ["apmap", "map"]);
  if (!mapRoot) {
    throw new Error("MindManager解析失败: 缺少Map根节点");
  }

  const firstOneTopic = getFirstDescendantByName(mapRoot, "onetopic");
  const rootTopicElement = firstOneTopic
    ? getDirectChildElements(firstOneTopic).find((child) => getLocalName(child) === "topic") || null
    : getFirstDescendantByName(mapRoot, "topic");

  if (!rootTopicElement) {
    throw new Error("MindManager中没有找到有效Topic节点，无法建立脑图");
  }

  const root = toMindManagerNode(rootTopicElement);
  if (!root || !root.text) {
    throw new Error("MindManager中没有找到有效Topic节点，无法建立脑图");
  }

  const title = root.text || getFileBaseName(fileName, "MindManager脑图");
  return createMindmapImportTree({
    sourceType: "mindmanager",
    title,
    sheets: [createMindmapImportSheet({
      id: "mindmanager-root",
      title,
      root,
      sourceMeta: {
        syntax: "mindmanager",
      },
    })],
    sourceMeta: {
      fileName,
      syntax: "mindmanager",
      ...sourceMeta,
    },
  });
}

export async function parseMindManagerFile(file) {
  const fileName = String(file && file.name ? file.name : "");
  const extensionMatch = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  const extension = extensionMatch ? extensionMatch[1] : "";

  if (extension === "xmmap") {
    const rawText = await file.text();
    const document = parseXmlDocument(rawText, "MindManager");
    return buildMindManagerTree(document, fileName, {
      container: "xml",
    });
  }

  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (error) {
    throw new Error(`MindManager压缩包解析失败: ${error && error.message ? error.message : String(error)}`);
  }

  const entryNames = Object.keys(zip.files).sort((left, right) => left.localeCompare(right, "en"));
  const documentEntry = findZipEntryByBaseName(entryNames, "document.xml");
  if (!documentEntry) {
    throw new Error("MindManager文件中未找到Document.xml");
  }

  let rawText = "";
  try {
    rawText = await zip.files[documentEntry].async("string");
  } catch (error) {
    throw new Error(`Document.xml解析失败: ${error && error.message ? error.message : String(error)}`);
  }

  const document = parseXmlDocument(rawText, "MindManager");
  return buildMindManagerTree(document, fileName, {
    container: "zip",
    documentEntry,
  });
}
