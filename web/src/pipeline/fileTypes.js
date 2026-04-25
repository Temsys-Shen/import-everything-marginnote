const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "tif",
  "tiff",
  "svg",
  "ico",
  "avif",
  "heic",
  "heif",
]);

const CODE_LANGUAGE_MAP = {
  js: "javascript",
  cjs: "javascript",
  mjs: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  py: "python",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  go: "go",
  rb: "ruby",
  php: "php",
  swift: "swift",
  cs: "csharp",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  c: "c",
  h: "c",
  hpp: "cpp",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  json: "json",
  json5: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  ini: "ini",
  conf: "ini",
  cfg: "ini",
  mdx: "md",
  vue: "vue",
  svelte: "svelte",
  dart: "dart",
  r: "r",
  m: "matlab",
  tex: "latex",
  lua: "lua",
  dockerfile: "dockerfile",
  makefile: "makefile",
  gradle: "gradle",
  properties: "properties",
  proto: "protobuf",
  asm: "x86asm",
};

const CODE_FILE_NAMES = {
  dockerfile: "dockerfile",
  makefile: "makefile",
  cmakelists: "cmake",
  gemfile: "ruby",
  rakefile: "ruby",
  justfile: "makefile",
};

const TEXT_FILE_NAMES = new Set([
  "license",
  "licence",
  "copying",
  "notice",
  "authors",
  "contributors",
  "changelog",
  "changes",
  "history",
  "readme",
  "contributing",
  "security",
  "patents",
  "todo",
]);

export function getFileExtension(name) {
  const normalized = String(name || "").trim().toLowerCase();
  const parts = normalized.split(".");
  if (parts.length <= 1) {
    return "";
  }
  return parts.pop();
}

export function getFileBaseName(name) {
  const normalized = String(name || "").trim().toLowerCase();
  const parts = normalized.split("/").pop().split("\\").pop();
  return parts;
}

export function resolveCodeLanguage(name) {
  const extension = getFileExtension(name);
  if (extension && CODE_LANGUAGE_MAP[extension]) {
    return CODE_LANGUAGE_MAP[extension];
  }

  const baseName = getFileBaseName(name);
  const lowerBase = baseName.toLowerCase();
  if (CODE_FILE_NAMES[lowerBase]) {
    return CODE_FILE_NAMES[lowerBase];
  }

  return "plaintext";
}

export function detectSourceType(file) {
  const extension = getFileExtension(file.name);
  const mime = String(file.type || "").toLowerCase();
  const baseName = getFileBaseName(file.name).toLowerCase();

  if (extension === "doc") return "unsupported-doc";
  if (extension === "ppt") return "unsupported-ppt";

  if (extension === "docx") return "docx";
  if (extension === "rtf") return "rtf";
  if (extension === "xls" || extension === "xlsx" || extension === "csv") return "spreadsheet";
  if (extension === "pptx") return "pptx";
  if (extension === "md" || extension === "markdown" || extension === "mkd" || extension === "mkdn") return "markdown";
  if (extension === "html" || extension === "htm" || extension === "xhtml") return "html";
  if (extension === "txt") return "text";
  if (extension === "epub") return "epub";

  if (IMAGE_EXTENSIONS.has(extension) || mime.startsWith("image/")) {
    return "image";
  }

  if (CODE_LANGUAGE_MAP[extension] || CODE_FILE_NAMES[baseName]) {
    return "code";
  }

  if (TEXT_FILE_NAMES.has(baseName)) {
    return "text";
  }

  if (mime.startsWith("text/")) {
    return "text";
  }

  return "unsupported";
}

export async function isProbablyBinaryFile(file, options = {}) {
  const sampleSize = Math.max(256, Number(options.sampleSize) || 4096);
  const sampleBuffer = await file.slice(0, sampleSize).arrayBuffer();
  const bytes = new Uint8Array(sampleBuffer);

  if (bytes.length === 0) {
    return false;
  }

  let zeroByteCount = 0;
  let suspiciousControlCount = 0;

  for (let index = 0; index < bytes.length; index += 1) {
    const value = bytes[index];

    if (value === 0) {
      zeroByteCount += 1;
      continue;
    }

    const isAllowedControl =
      value === 8 ||
      value === 9 ||
      value === 10 ||
      value === 12 ||
      value === 13;

    if (value < 32 && !isAllowedControl) {
      suspiciousControlCount += 1;
    }
  }

  if (zeroByteCount > 0) {
    return true;
  }

  if ((suspiciousControlCount / bytes.length) > 0.1) {
    return true;
  }

  try {
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const replacementCount = (decoded.match(/\uFFFD/g) || []).length;
    if ((replacementCount / Math.max(decoded.length, 1)) > 0.08) {
      return true;
    }
  } catch (error) {
    return true;
  }

  return false;
}

export async function resolveSourceTypeForConversion(file, detectedSourceType) {
  if (detectedSourceType !== "unsupported") {
    return detectedSourceType;
  }

  const mime = String(file.type || "").toLowerCase();
  if (mime.startsWith("text/")) {
    return "text";
  }

  const isBinary = await isProbablyBinaryFile(file);
  return isBinary ? "unsupported" : "text";
}

export function assertSupportedSourceType(sourceType, file) {
  if (sourceType === "unsupported-doc") {
    throw new Error(`Unsupported file type: ${file.name}. .doc is not supported in pure web prototype. Please convert to .docx first.`);
  }

  if (sourceType === "unsupported-ppt") {
    throw new Error(`Unsupported file type: ${file.name}. .ppt is not supported in pure web prototype. Please convert to .pptx first.`);
  }

  if (sourceType === "unsupported") {
    throw new Error(`Unsupported file type: ${file.name}. No parser available for this extension in the web prototype.`);
  }
}
