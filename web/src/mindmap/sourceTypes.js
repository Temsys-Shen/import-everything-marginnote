import JSZip from "jszip";
import { readAsArrayBuffer } from "../parsers/utils";
import { parseFreeMindFile } from "./freemindParser";
import { parseIThoughtsFile } from "./iThoughtsParser";
import { parseMarkdownMindmapFile } from "./markdownMindmapParser";
import { parseMindManagerFile } from "./mindManagerParser";
import { parseOpmlMindmapFile } from "./opmlParser";
import { parseSimpleMindFile } from "./simpleMindParser";
import { parseXmindMindmapFile } from "./xmindParser";
import { findZipEntryByBaseName } from "./xmlMindmapUtils";

// .zip 判断不出格式时，让用户手选的候选
const ZIP_MINDMAP_SOURCE_TYPE_OPTIONS = [
  { value: "xmind", label: "XMind" },
  { value: "ithoughts", label: "iThoughts" },
  { value: "simplemind", label: "SimpleMind" },
  { value: "mindmanager", label: "MindManager" },
];

export { ZIP_MINDMAP_SOURCE_TYPE_OPTIONS };

export function detectMindmapSourceType(file) {
  const match = String(file && file.name ? file.name : "").toLowerCase().match(/\.([a-z0-9]+)$/);
  const extension = match ? match[1] : "";

  if (extension === "md" || extension === "markdown") {
    return "markdown";
  }
  if (extension === "xmind") {
    return "xmind";
  }
  if (extension === "zip") {
    // 具体格式由内容判断（detectZipMindmapSourceTypeFromFile）
    return "zip";
  }
  if (extension === "mm") {
    return "freemind";
  }
  if (extension === "opml") {
    return "opml";
  }
  if (extension === "mmap" || extension === "xmmap") {
    return "mindmanager";
  }
  if (extension === "itmz") {
    return "ithoughts";
  }
  if (extension === "smmx") {
    return "simplemind";
  }
  return "unsupported";
}

// 按 zip 内条目名判断具体格式；判断不出来返回 ""
export function detectZipMindmapSourceType(entryNames) {
  const names = Array.isArray(entryNames) ? entryNames : [];

  if (findZipEntryByBaseName(names, "content.json") || findZipEntryByBaseName(names, "content.xml")) {
    return "xmind";
  }
  if (findZipEntryByBaseName(names, "mapdata.xml")) {
    return "ithoughts";
  }
  if (findZipEntryByBaseName(names, "document/mindmap.xml")) {
    return "simplemind";
  }
  if (findZipEntryByBaseName(names, "document.xml")) {
    return "mindmanager";
  }

  return "";
}

// 读 zip 内容判断格式；判断不出来返回 ""
export async function detectZipMindmapSourceTypeFromFile(file) {
  const buffer = await readAsArrayBuffer(file);
  const zip = await JSZip.loadAsync(buffer);
  return detectZipMindmapSourceType(Object.keys(zip.files));
}

export async function parseMindmapFileBySourceType(sourceType, file, options = {}) {
  if (sourceType === "markdown") {
    return parseMarkdownMindmapFile(file, options);
  }
  if (sourceType === "xmind") {
    return parseXmindMindmapFile(file, options);
  }
  if (sourceType === "freemind") {
    return parseFreeMindFile(file);
  }
  if (sourceType === "opml") {
    return parseOpmlMindmapFile(file);
  }
  if (sourceType === "mindmanager") {
    return parseMindManagerFile(file);
  }
  if (sourceType === "ithoughts") {
    return parseIThoughtsFile(file);
  }
  if (sourceType === "simplemind") {
    return parseSimpleMindFile(file);
  }
  throw new Error(`Unsupported source type: ${sourceType}`);
}
