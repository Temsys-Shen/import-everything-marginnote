import { parseFreeMindFile } from "./freemindParser";
import { parseIThoughtsFile } from "./iThoughtsParser";
import { parseMarkdownMindmapFile } from "./markdownMindmapParser";
import { parseMindManagerFile } from "./mindManagerParser";
import { parseOpmlMindmapFile } from "./opmlParser";
import { parseSimpleMindFile } from "./simpleMindParser";
import { parseXmindMindmapFile } from "./xmindParser";

export function detectMindmapSourceType(file) {
  const match = String(file && file.name ? file.name : "").toLowerCase().match(/\.([a-z0-9]+)$/);
  const extension = match ? match[1] : "";

  if (extension === "md" || extension === "markdown") {
    return "markdown";
  }
  if (extension === "xmind") {
    return "xmind";
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

export async function parseMindmapFileBySourceType(sourceType, file) {
  if (sourceType === "markdown") {
    return parseMarkdownMindmapFile(file);
  }
  if (sourceType === "xmind") {
    return parseXmindMindmapFile(file);
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
