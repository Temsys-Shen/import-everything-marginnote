import JSZip from "jszip";
import { createMindmapImportNode, createMindmapImportSheet, createMindmapImportTree } from "./model";

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeJsonParse(rawText) {
  return JSON.parse(String(rawText || "").replace(/^\uFEFF/, ""));
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

export async function parseXmindMindmapFile(file) {
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (error) {
    throw new Error(`XMind压缩包解析失败: ${error && error.message ? error.message : String(error)}`);
  }

  const entryNames = Object.keys(zip.files).sort((left, right) => left.localeCompare(right, "en"));
  const contentJsonKey = entryNames.find((name) => name.toLowerCase().endsWith("content.json"));
  if (!contentJsonKey) {
    throw new Error("XMind文件中未找到content.json。当前首版仅支持现代JSON版XMind。");
  }

  let parsed;
  try {
    const rawText = await zip.files[contentJsonKey].async("string");
    parsed = safeJsonParse(rawText);
  } catch (error) {
    throw new Error(`content.json解析失败: ${error && error.message ? error.message : String(error)}`);
  }

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
    title: file.name.replace(/\.[^.]+$/, "") || importSheets[0].title,
    sheets: importSheets,
    sourceMeta: {
      fileName: file.name,
      contentEntry: contentJsonKey,
      totalSheetCount: sheets.length,
      zipEntries: entryNames,
    },
  });
}
