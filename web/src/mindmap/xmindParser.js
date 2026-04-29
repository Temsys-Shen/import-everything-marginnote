import JSZip from "jszip";
import { createMindmapImportNode, createMindmapImportSheet, createMindmapImportTree } from "./model";
import {
  findZipEntryByBaseName,
  getDirectChildElementsByName,
  getElementText,
  getFileBaseName,
  getFirstDirectChildByName,
  getTrimmedAttribute,
  parseXmlDocument,
} from "./xmlMindmapUtils";

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeJsonParse(rawText) {
  return JSON.parse(String(rawText || "").replace(/^\uFEFF/, ""));
}

function safeXmlParse(rawText) {
  return parseXmlDocument(String(rawText || "").replace(/^\uFEFF/, ""), "XMind");
}

function extractSheetsFromUnknown(value, maxDepth = 6) {
  if (!value || maxDepth <= 0) {
    return [];
  }

  if (Array.isArray(value)) {
    const sheets = value.filter((item) => isRecord(item) && (
      item.class === "sheet" ||
      Object.prototype.hasOwnProperty.call(item, "rootTopic") ||
      Object.prototype.hasOwnProperty.call(item, "rootTopicId") ||
      Object.prototype.hasOwnProperty.call(item, "topic") ||
      Object.prototype.hasOwnProperty.call(item, "topicId")
    ));
    if (sheets.length > 0) {
      return sheets;
    }

    for (const item of value) {
      const nested = extractSheetsFromUnknown(item, maxDepth - 1);
      if (nested.length > 0) {
        return nested;
      }
    }
    return [];
  }

  if (!isRecord(value)) {
    return [];
  }

  const directKeys = ["sheets", "sheet", "content", "data", "workbook"];
  for (const key of directKeys) {
    const nested = extractSheetsFromUnknown(value[key], maxDepth - 1);
    if (nested.length > 0) {
      return nested;
    }
  }

  if (
    value.class === "sheet" ||
    Object.prototype.hasOwnProperty.call(value, "rootTopic") ||
    Object.prototype.hasOwnProperty.call(value, "rootTopicId") ||
    Object.prototype.hasOwnProperty.call(value, "topic") ||
    Object.prototype.hasOwnProperty.call(value, "topicId")
  ) {
    return [value];
  }

  for (const nestedValue of Object.values(value)) {
    const nested = extractSheetsFromUnknown(nestedValue, maxDepth - 1);
    if (nested.length > 0) {
      return nested;
    }
  }

  return [];
}

function buildTopicsById(value, maxDepth = 6) {
  if (!value || maxDepth <= 0) {
    return {};
  }

  if (Array.isArray(value)) {
    const directMap = {};
    value.forEach((item) => {
      if (!isRecord(item)) {
        return;
      }

      const idValue = item.id;
      if (typeof idValue !== "string" && typeof idValue !== "number") {
        return;
      }

      if (
        typeof item.title === "string" ||
        typeof item.text === "string" ||
        typeof item.name === "string"
      ) {
        directMap[String(idValue)] = item;
      }
    });

    if (Object.keys(directMap).length > 0) {
      return directMap;
    }

    for (const item of value) {
      const nested = buildTopicsById(item, maxDepth - 1);
      if (Object.keys(nested).length > 0) {
        return nested;
      }
    }
    return {};
  }

  if (!isRecord(value)) {
    return {};
  }

  const candidates = [value.topics, value.topic, value.resources];
  for (const candidate of candidates) {
    const nested = buildTopicsById(candidate, maxDepth - 1);
    if (Object.keys(nested).length > 0) {
      return nested;
    }
  }

  for (const nestedValue of Object.values(value)) {
    const nested = buildTopicsById(nestedValue, maxDepth - 1);
    if (Object.keys(nested).length > 0) {
      return nested;
    }
  }

  return {};
}

function resolveTopicValue(value, topicsById) {
  if (isRecord(value) && (
    typeof value.title === "string" ||
    typeof value.text === "string" ||
    typeof value.name === "string"
  )) {
    return value;
  }

  if (isRecord(value)) {
    const refId =
      typeof value.id === "string" || typeof value.id === "number"
        ? String(value.id)
        : typeof value.topicId === "string" || typeof value.topicId === "number"
          ? String(value.topicId)
          : null;

    if (refId && isRecord(topicsById[refId])) {
      return {
        ...topicsById[refId],
        ...value,
      };
    }
  }

  if (typeof value === "string" || typeof value === "number") {
    return topicsById[String(value)] || null;
  }

  return value;
}

function normalizeLabels(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/[,;\n]/g).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeMarkers(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    if (typeof item === "string") {
      return item.trim();
    }
    if (isRecord(item) && typeof item.markerId === "string") {
      return item.markerId.trim();
    }
    if (isRecord(item) && typeof item.id === "string") {
      return item.id.trim();
    }
    return "";
  }).filter(Boolean);
}

function normalizeNoteContent(value) {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (!isRecord(value)) {
    return "";
  }
  if (typeof value.plain === "string") {
    return value.plain.trim();
  }
  if (isRecord(value.plain) && typeof value.plain.content === "string") {
    return value.plain.content.trim();
  }
  if (typeof value.content === "string") {
    return value.content.trim();
  }
  return "";
}

function extractBranchColor(topicRecord) {
  const style = isRecord(topicRecord.style) ? topicRecord.style : null;
  const candidates = [
    style && style.fillColor,
    style && style.strokeColor,
    style && style.lineColor,
    topicRecord.fillColor,
    topicRecord.branchColor,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function extractChildTopics(topicRecord, topicsById, seen) {
  const attached = [];

  if (Array.isArray(topicRecord.children)) {
    topicRecord.children.forEach((item) => {
      attached.push(toMindmapImportNode(item, topicsById, seen));
    });
    return attached;
  }

  if (!isRecord(topicRecord.children)) {
    return attached;
  }

  const groups = [
    topicRecord.children.attached,
    topicRecord.children.detached,
  ];

  groups.forEach((group) => {
    if (!Array.isArray(group)) {
      return;
    }
    group.forEach((item) => {
      attached.push(toMindmapImportNode(item, topicsById, seen));
    });
  });

  Object.values(topicRecord.children).forEach((value) => {
    if (!isRecord(value)) {
      return;
    }
    const topics = Array.isArray(value.topics) ? value.topics : Array.isArray(value.topic) ? value.topic : null;
    if (!topics) {
      return;
    }
    topics.forEach((item) => {
      attached.push(toMindmapImportNode(item, topicsById, seen));
    });
  });

  return attached;
}

function toMindmapImportNode(rawTopic, topicsById, seen) {
  const resolved = resolveTopicValue(rawTopic, topicsById);
  const topicRecord = isRecord(resolved) ? resolved : {};

  const rawId = typeof topicRecord.id === "string" || typeof topicRecord.id === "number"
    ? String(topicRecord.id)
    : "";

  if (rawId) {
    if (seen.has(rawId)) {
      return createMindmapImportNode({
        text: String(topicRecord.title || topicRecord.text || topicRecord.name || "(无标题)").trim() || "(无标题)",
      });
    }
    seen.add(rawId);
  }

  const labels = normalizeLabels(topicRecord.labels);
  const markers = normalizeMarkers(topicRecord.markers || topicRecord.markerRefs);
  const branchColor = extractBranchColor(topicRecord);
  const comment = normalizeNoteContent(topicRecord.notes || topicRecord.note);
  const children = extractChildTopics(topicRecord, topicsById, seen);
  const text = String(topicRecord.title || topicRecord.text || topicRecord.name || "").trim() || "(无标题)";

  return createMindmapImportNode({
    id: rawId || undefined,
    text,
    children,
    comment,
    style: {
      labels,
      markers,
      branchColor,
    },
    sourceMeta: {
      xmindTopicId: rawId || null,
      collapsed: Boolean(topicRecord.collapsed || topicRecord.folded || topicRecord.isFolded),
    },
  });
}

function extractSheetTitle(sheet, index) {
  if (typeof sheet.title === "string" && sheet.title.trim()) {
    return sheet.title.trim();
  }
  if (typeof sheet.name === "string" && sheet.name.trim()) {
    return sheet.name.trim();
  }
  return `Sheet ${index + 1}`;
}

function extractRootTopicRef(sheet) {
  if (sheet.rootTopic != null) return sheet.rootTopic;
  if (sheet.rootTopicId != null) return sheet.rootTopicId;
  if (sheet.topic != null) return sheet.topic;
  if (sheet.topicId != null) return sheet.topicId;
  return null;
}

function normalizeXmindXmlText(element) {
  return getElementText(element).replace(/\s+/g, " ").trim();
}

function extractXmindXmlLabels(topicElement) {
  return getDirectChildElementsByName(topicElement, "labels")
    .flatMap((labelsElement) => getDirectChildElementsByName(labelsElement, "label"))
    .map((labelElement) => normalizeXmindXmlText(labelElement))
    .filter(Boolean);
}

function extractXmindXmlMarkers(topicElement) {
  return getDirectChildElementsByName(topicElement, "marker-refs")
    .flatMap((markerRefsElement) => getDirectChildElementsByName(markerRefsElement, "marker-ref"))
    .map((markerRefElement) => getTrimmedAttribute(markerRefElement, ["marker-id", "markerId"]))
    .filter(Boolean);
}

function extractXmindXmlComment(topicElement) {
  const notesElement = getFirstDirectChildByName(topicElement, "notes");
  if (!notesElement) {
    return "";
  }

  const plainNote = getFirstDirectChildByName(notesElement, "plain");
  if (plainNote) {
    return normalizeXmindXmlText(plainNote);
  }

  const htmlNote = getFirstDirectChildByName(notesElement, "html");
  if (htmlNote) {
    return normalizeXmindXmlText(htmlNote);
  }

  return "";
}

function extractXmindXmlChildTopics(topicElement, seen) {
  const childrenElement = getFirstDirectChildByName(topicElement, "children");
  if (!childrenElement) {
    return [];
  }

  return getDirectChildElementsByName(childrenElement, "topics")
    .flatMap((topicsElement) => getDirectChildElementsByName(topicsElement, "topic"))
    .map((childTopicElement) => toXmindXmlNode(childTopicElement, seen))
    .filter(Boolean);
}

function toXmindXmlNode(topicElement, seen) {
  const rawId = getTrimmedAttribute(topicElement, ["id"]);
  const titleElement = getFirstDirectChildByName(topicElement, "title");
  const text = titleElement ? normalizeXmindXmlText(titleElement) : "";
  if (!text) {
    return null;
  }

  if (rawId) {
    if (seen.has(rawId)) {
      return createMindmapImportNode({
        id: rawId,
        text,
      });
    }
    seen.add(rawId);
  }

  return createMindmapImportNode({
    id: rawId || undefined,
    text,
    children: extractXmindXmlChildTopics(topicElement, seen),
    comment: extractXmindXmlComment(topicElement),
    style: {
      labels: extractXmindXmlLabels(topicElement),
      markers: extractXmindXmlMarkers(topicElement),
    },
    sourceMeta: {
      xmindTopicId: rawId || null,
      collapsed: getTrimmedAttribute(topicElement, ["branch", "structure-class"]) === "org.xmind.ui.logic.right",
    },
  });
}

function parseLegacyXmindDocument(document, fileName, contentEntry, entryNames) {
  const sheetElements = Array.from(document.getElementsByTagName("*")).filter(
    (element) => element && element.localName && String(element.localName).toLowerCase() === "sheet",
  );
  if (sheetElements.length === 0) {
    throw new Error("content.xml中未识别到有效sheet");
  }

  const importSheets = sheetElements.map((sheetElement, index) => {
    const titleElement = getFirstDirectChildByName(sheetElement, "title");
    const topicElement = getFirstDirectChildByName(sheetElement, "topic");
    if (!topicElement) {
      throw new Error(`第${index + 1}个sheet缺少root topic`);
    }

    const root = toXmindXmlNode(topicElement, new Set());
    if (!root || !root.text) {
      throw new Error(`第${index + 1}个sheet根节点标题为空`);
    }

    return createMindmapImportSheet({
      id: getTrimmedAttribute(sheetElement, ["id"]) || undefined,
      title: titleElement ? normalizeXmindXmlText(titleElement) : root.text,
      root,
      sourceMeta: {
        sheetIndex: index,
      },
    });
  });

  return createMindmapImportTree({
    sourceType: "xmind",
    title: getFileBaseName(fileName, importSheets[0] ? importSheets[0].title : "XMind脑图"),
    sheets: importSheets,
    sourceMeta: {
      fileName,
      contentEntry,
      totalSheetCount: importSheets.length,
      zipEntries: entryNames,
      xmindVariant: "legacy-xml",
    },
  });
}

function parseModernXmindData(parsed, fileName, contentEntry, entryNames) {
  const sheets = extractSheetsFromUnknown(parsed);
  if (sheets.length === 0) {
    throw new Error("content.json中未识别到有效sheet");
  }

  const topicsById = buildTopicsById(parsed);
  const importSheets = sheets.map((sheet, index) => {
    const rootRef = extractRootTopicRef(sheet);
    if (!rootRef) {
      throw new Error(`第${index + 1}个sheet缺少root topic`);
    }

    const rootNode = toMindmapImportNode(rootRef, topicsById, new Set());
    if (!rootNode.text) {
      throw new Error(`第${index + 1}个sheet根节点标题为空`);
    }

    return createMindmapImportSheet({
      id: typeof sheet.id === "string" || typeof sheet.id === "number" ? String(sheet.id) : undefined,
      title: extractSheetTitle(sheet, index),
      root: rootNode,
      sourceMeta: {
        sheetIndex: index,
      },
    });
  });

  return createMindmapImportTree({
    sourceType: "xmind",
    title: getFileBaseName(fileName, importSheets[0] ? importSheets[0].title : "XMind脑图"),
    sheets: importSheets,
    sourceMeta: {
      fileName,
      contentEntry,
      totalSheetCount: sheets.length,
      zipEntries: entryNames,
      xmindVariant: "modern-json",
    },
  });
}

export async function parseXmindMindmapFile(file) {
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (error) {
    throw new Error(`XMind压缩包解析失败: ${error && error.message ? error.message : String(error)}`);
  }

  const entryNames = Object.keys(zip.files).sort((left, right) => left.localeCompare(right, "en"));
  const contentJsonKey = findZipEntryByBaseName(entryNames, "content.json");
  if (contentJsonKey) {
    let parsed;
    try {
      const rawText = await zip.files[contentJsonKey].async("string");
      parsed = safeJsonParse(rawText);
    } catch (error) {
      throw new Error(`content.json解析失败: ${error && error.message ? error.message : String(error)}`);
    }

    return parseModernXmindData(parsed, file.name, contentJsonKey, entryNames);
  }

  const contentXmlKey = findZipEntryByBaseName(entryNames, "content.xml");
  if (!contentXmlKey) {
    throw new Error("XMind文件中未找到content.json或content.xml");
  }

  let document;
  try {
    const rawText = await zip.files[contentXmlKey].async("string");
    document = safeXmlParse(rawText);
  } catch (error) {
    throw new Error(`content.xml解析失败: ${error && error.message ? error.message : String(error)}`);
  }

  return parseLegacyXmindDocument(document, file.name, contentXmlKey, entryNames);
}
