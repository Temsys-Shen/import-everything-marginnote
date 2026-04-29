import JSZip from "jszip";
import { createMindmapImportNode, createMindmapImportSheet, createMindmapImportTree } from "./model";
import {
  findZipEntryByBaseName,
  getDirectChildElementsByName,
  getFileBaseName,
  getTrimmedAttribute,
  parseXmlDocument,
} from "./xmlMindmapUtils";

function buildIThoughtsNode(topicElement) {
  const text = getTrimmedAttribute(topicElement, ["text", "label", "title"]);
  if (!text) {
    return null;
  }

  const children = getDirectChildElementsByName(topicElement, "topic")
    .map((child) => buildIThoughtsNode(child))
    .filter(Boolean);

  return createMindmapImportNode({
    id: getTrimmedAttribute(topicElement, ["uuid", "id"]) || undefined,
    text,
    children,
    comment: getTrimmedAttribute(topicElement, ["note", "notes"]),
    sourceMeta: {
      syntax: "ithoughts-topic",
    },
  });
}

export async function parseIThoughtsFile(file) {
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (error) {
    throw new Error(`iThoughts压缩包解析失败: ${error && error.message ? error.message : String(error)}`);
  }

  const entryNames = Object.keys(zip.files).sort((left, right) => left.localeCompare(right, "en"));
  const mapDataEntry = findZipEntryByBaseName(entryNames, "mapdata.xml");
  if (!mapDataEntry) {
    throw new Error("iThoughts文件中未找到MapData.xml");
  }

  let rawText = "";
  try {
    rawText = await zip.files[mapDataEntry].async("string");
  } catch (error) {
    throw new Error(`MapData.xml解析失败: ${error && error.message ? error.message : String(error)}`);
  }

  const document = parseXmlDocument(rawText, "iThoughts");
  const topicsElement = document.querySelector("topics");
  if (!topicsElement) {
    throw new Error("iThoughts解析失败: 缺少topics节点");
  }

  const topLevelNodes = getDirectChildElementsByName(topicsElement, "topic")
    .map((child) => buildIThoughtsNode(child))
    .filter(Boolean);

  if (topLevelNodes.length === 0) {
    throw new Error("iThoughts中没有找到有效topic节点，无法建立脑图");
  }

  const fileBaseName = getFileBaseName(file.name, "iThoughts脑图");
  const root = topLevelNodes.length === 1
    ? topLevelNodes[0]
    : createMindmapImportNode({
      text: fileBaseName,
      children: topLevelNodes,
      sourceMeta: {
        syntax: "ithoughts-virtual-root",
      },
    });

  return createMindmapImportTree({
    sourceType: "ithoughts",
    title: root.text || fileBaseName,
    sheets: [createMindmapImportSheet({
      id: "ithoughts-root",
      title: root.text || fileBaseName,
      root,
      sourceMeta: {
        syntax: "ithoughts",
      },
    })],
    sourceMeta: {
      fileName: file.name,
      syntax: "ithoughts",
      mapDataEntry,
    },
  });
}
