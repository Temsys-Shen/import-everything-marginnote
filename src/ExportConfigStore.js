var __MN_EXPORT_CONFIG_STORE_MNImportEverythingAddon = (function () {
  const CONFIG_DIR_NAME = "import-everything-config";
  const STYLES_DIR_NAME = "styles";
  const FONTS_DIR_NAME = "fonts";
  const TRASH_DIR_NAME = "_trash";
  const JSON_ENCODING = 4;

  const BUILTIN_STYLE_DEFINITIONS = [
    {
      id: "builtin-default-clear",
      name: "默认清晰",
      fileName: "builtin-default-clear.css",
      cssText: `
:root {
  --preview-page-bg: #ffffff;
  --preview-text-color: #182018;
  --preview-muted-color: #687363;
  --preview-heading-color: #122418;
  --preview-line-color: #d9e1d8;
  --preview-block-bg: #ffffff;
  --preview-code-bg: #142118;
  --preview-code-color: #f3f6f2;
  --preview-accent-color: #1f6a49;
  --preview-cover-align: left;
}

.doc-cover,
.content-section {
  background: var(--preview-block-bg);
}

.doc-cover h3,
.content-section h4 {
  color: var(--preview-heading-color);
  letter-spacing: 0.01em;
}

.content-html a {
  color: var(--preview-accent-color);
}
      `.trim(),
    },
    {
      id: "builtin-paper-article",
      name: "论文排版",
      fileName: "builtin-paper-article.css",
      cssText: `
:root {
  --preview-page-bg: #fffdf8;
  --preview-text-color: #202020;
  --preview-muted-color: #736c63;
  --preview-heading-color: #111111;
  --preview-line-color: #d8d1c7;
  --preview-block-bg: #fffefc;
  --preview-code-bg: #211d19;
  --preview-code-color: #f6f1eb;
  --preview-accent-color: #7f3f00;
  --preview-cover-align: center;
  --preview-body-font-stack: "Songti SC", "STSong", serif;
  --preview-heading-font-stack: "Songti SC", "STSong", serif;
}

.doc-cover h3,
.content-section h4 {
  font-weight: 700;
}

.content-html {
  font-size: 14px;
  line-height: 1.85;
}

.content-html p + p {
  margin-top: 0.6em;
}

.content-html blockquote {
  border-left: 3px solid var(--preview-line-color);
  margin: 0;
  padding-left: 14px;
  color: #58524a;
}
      `.trim(),
    },
    {
      id: "builtin-compact-reading",
      name: "紧凑阅读",
      fileName: "builtin-compact-reading.css",
      cssText: `
:root {
  --preview-page-bg: #fbfcfa;
  --preview-text-color: #15221a;
  --preview-muted-color: #607062;
  --preview-heading-color: #102117;
  --preview-line-color: #d3ddd3;
  --preview-block-bg: #fbfcfa;
  --preview-code-bg: #132118;
  --preview-code-color: #eff7f1;
  --preview-accent-color: #19543a;
}

.print-block {
  padding: 10px;
}

.content-section h4 {
  margin-bottom: 6px;
  font-size: 14px;
}

.content-html {
  font-size: 12px;
  line-height: 1.5;
}

.content-html th,
.content-html td {
  padding: 4px 5px;
}

.toc-list {
  gap: 4px;
}
      `.trim(),
    },
    {
      id: "builtin-classic-print",
      name: "经典打印",
      fileName: "builtin-classic-print.css",
      cssText: `
:root {
  --preview-page-bg: #ffffff;
  --preview-text-color: #111111;
  --preview-muted-color: #666666;
  --preview-heading-color: #000000;
  --preview-line-color: #bbbbbb;
  --preview-block-bg: #ffffff;
  --preview-code-bg: #222222;
  --preview-code-color: #f7f7f7;
  --preview-accent-color: #000000;
  --preview-cover-align: left;
}

.print-block {
  border-radius: 0;
  border-color: #cccccc;
  box-shadow: none;
}

.doc-cover h3,
.content-section h4 {
  text-transform: none;
}

.content-html table,
.content-html th,
.content-html td {
  border-color: #999999;
}
      `.trim(),
    },
  ];

  function fileManager() {
    return NSFileManager.defaultManager();
  }

  function normalizePath(inputPath) {
    const raw = String(inputPath || "");
    const isAbsolute = raw.startsWith("/");
    const parts = raw.split("/");
    const normalized = [];

    parts.forEach(function (part) {
      if (!part || part === ".") {
        return;
      }
      if (part === "..") {
        if (normalized.length > 0) {
          normalized.pop();
        }
        return;
      }
      normalized.push(part);
    });

    return `${isAbsolute ? "/" : ""}${normalized.join("/")}`;
  }

  function ensureDirectory(path) {
    const fm = fileManager();
    if (fm.fileExistsAtPath(path)) {
      if (!fm.isDirectoryAtPath(path)) {
        throw new Error(`Path exists but is not a directory: ${path}`);
      }
      return;
    }

    const created = fm.createDirectoryAtPathWithIntermediateDirectoriesAttributes(path, true, null);
    if (!created) {
      throw new Error(`Failed to create directory: ${path}`);
    }
  }

  function pathExists(path) {
    return fileManager().fileExistsAtPath(path);
  }

  function sanitizeFileName(fileName, fallbackBaseName, fallbackExt) {
    const rawName = String(fileName || "").trim();
    const sanitized = rawName.replace(/[\\/:*?"<>|]/g, "_");
    if (sanitized) {
      return sanitized;
    }
    return `${fallbackBaseName || "file"}${fallbackExt || ""}`;
  }

  function inferMimeTypeFromExtension(fileName) {
    const lower = String(fileName || "").toLowerCase();
    if (lower.endsWith(".ttf")) return "font/ttf";
    if (lower.endsWith(".otf")) return "font/otf";
    if (lower.endsWith(".woff")) return "font/woff";
    if (lower.endsWith(".woff2")) return "font/woff2";
    if (lower.endsWith(".css")) return "text/css";
    return "application/octet-stream";
  }

  function nowIsoString() {
    return new Date().toISOString();
  }

  function uuidString() {
    const value = NSUUID.UUID().UUIDString();
    return String(typeof value === "function" ? value() : value);
  }

  function stringFromData(data) {
    if (!data || Number(data.length()) <= 0) {
      return "";
    }
    return String(NSString.stringWithContentsOfData(data) || "");
  }

  function writeTextFile(path, content) {
    const textData = NSData.dataWithStringEncoding(String(content || ""), JSON_ENCODING);
    if (!textData) {
      throw new Error(`Failed to encode text for ${path}`);
    }

    const wrote = textData.writeToFileAtomically(path, true);
    if (!wrote) {
      throw new Error(`Failed to write file: ${path}`);
    }
  }

  function readJsonFile(path, fallbackValue) {
    if (!pathExists(path)) {
      return fallbackValue;
    }

    const data = NSData.dataWithContentsOfFile(path);
    if (!data || Number(data.length()) <= 0) {
      return fallbackValue;
    }

    const parsed = NSJSONSerialization.JSONObjectWithDataOptions(data, 0);
    if (parsed === undefined || parsed === null) {
      return fallbackValue;
    }

    return parsed;
  }

  function writeJsonFile(path, value) {
    const jsonData = NSJSONSerialization.dataWithJSONObjectOptions(value, 0);
    if (!jsonData) {
      throw new Error(`Failed to encode JSON for ${path}`);
    }

    const wrote = jsonData.writeToFileAtomically(path, true);
    if (!wrote) {
      throw new Error(`Failed to write JSON file: ${path}`);
    }
  }

  function uniqueTargetPath(targetDir, fileName) {
    const safeName = sanitizeFileName(fileName, "file", "");
    const extIndex = safeName.lastIndexOf(".");
    const baseName = extIndex > 0 ? safeName.slice(0, extIndex) : safeName;
    const ext = extIndex > 0 ? safeName.slice(extIndex) : "";
    let candidate = `${targetDir}/${safeName}`;
    let index = 1;

    while (pathExists(candidate)) {
      candidate = `${targetDir}/${baseName}-${index}${ext}`;
      index += 1;
      if (index > 10000) {
        throw new Error(`Too many duplicate names for ${fileName}`);
      }
    }

    return candidate;
  }

  function moveToTrash(sourcePath, trashDir) {
    if (!pathExists(sourcePath)) {
      return null;
    }
    ensureDirectory(trashDir);
    const fileName = sourcePath.split("/").pop();
    const targetPath = uniqueTargetPath(trashDir, fileName);
    const moved = fileManager().moveItemAtPathToPath(sourcePath, targetPath);
    if (!moved) {
      throw new Error(`Failed to move item to trash: ${sourcePath}`);
    }
    return targetPath;
  }

  function configPaths(mainPath) {
    const rootPath = normalizePath(`${mainPath}/../../Preferences/${CONFIG_DIR_NAME}`);
    const stylesDirPath = `${rootPath}/${STYLES_DIR_NAME}`;
    const fontsDirPath = `${rootPath}/${FONTS_DIR_NAME}`;
    const trashRootPath = `${rootPath}/${TRASH_DIR_NAME}`;
    const styleTrashDirPath = `${trashRootPath}/${STYLES_DIR_NAME}`;
    const fontTrashDirPath = `${trashRootPath}/${FONTS_DIR_NAME}`;

    return {
      rootPath,
      stylesDirPath,
      fontsDirPath,
      trashRootPath,
      styleTrashDirPath,
      fontTrashDirPath,
      stylesIndexPath: `${stylesDirPath}/index.json`,
      fontsIndexPath: `${fontsDirPath}/index.json`,
    };
  }

  function ensureBaseDirectories(mainPath) {
    const paths = configPaths(mainPath);
    ensureDirectory(paths.rootPath);
    ensureDirectory(paths.stylesDirPath);
    ensureDirectory(paths.fontsDirPath);
    ensureDirectory(paths.trashRootPath);
    ensureDirectory(paths.styleTrashDirPath);
    ensureDirectory(paths.fontTrashDirPath);
    return paths;
  }

  function normalizeStyleRecord(record) {
    if (!record || typeof record !== "object") {
      return null;
    }

    return {
      id: String(record.id || ""),
      name: String(record.name || ""),
      fileName: String(record.fileName || ""),
      builtin: record.builtin === true,
      createdAt: String(record.createdAt || nowIsoString()),
      updatedAt: String(record.updatedAt || nowIsoString()),
    };
  }

  function normalizeFontRecord(record) {
    if (!record || typeof record !== "object") {
      return null;
    }

    return {
      id: String(record.id || ""),
      family: String(record.family || ""),
      weight: Number(record.weight || 400),
      style: String(record.style || "normal"),
      fileName: String(record.fileName || ""),
      createdAt: String(record.createdAt || nowIsoString()),
      updatedAt: String(record.updatedAt || nowIsoString()),
    };
  }

  function filterValidRecords(records, normalizer, fileDirPath) {
    if (!Array.isArray(records)) {
      return [];
    }

    return records
      .map(normalizer)
      .filter(function (record) {
        if (!record) return false;
        if (!record.id || !record.fileName) return false;
        const filePath = `${fileDirPath}/${record.fileName}`;
        return pathExists(filePath);
      });
  }

  function ensureBuiltinStyles(mainPath) {
    const paths = ensureBaseDirectories(mainPath);
    const currentIndex = filterValidRecords(
      readJsonFile(paths.stylesIndexPath, []),
      normalizeStyleRecord,
      paths.stylesDirPath,
    );
    const byId = {};
    currentIndex.forEach(function (item) {
      byId[item.id] = item;
    });

    BUILTIN_STYLE_DEFINITIONS.forEach(function (definition) {
      const stylePath = `${paths.stylesDirPath}/${definition.fileName}`;
      if (!pathExists(stylePath)) {
        writeTextFile(stylePath, definition.cssText);
      }

      const current = byId[definition.id];
      if (current) {
        current.name = definition.name;
        current.fileName = definition.fileName;
        current.builtin = true;
        current.updatedAt = nowIsoString();
        return;
      }

      byId[definition.id] = {
        id: definition.id,
        name: definition.name,
        fileName: definition.fileName,
        builtin: true,
        createdAt: nowIsoString(),
        updatedAt: nowIsoString(),
      };
    });

    const nextIndex = Object.keys(byId).map(function (id) {
      return byId[id];
    }).sort(function (left, right) {
      if (left.builtin !== right.builtin) {
        return left.builtin ? -1 : 1;
      }
      return String(left.name).localeCompare(String(right.name));
    });
    writeJsonFile(paths.stylesIndexPath, nextIndex);
    return {
      paths,
      styles: nextIndex,
    };
  }

  function loadStyleIndex(mainPath) {
    const result = ensureBuiltinStyles(mainPath);
    return {
      paths: result.paths,
      styles: filterValidRecords(result.styles, normalizeStyleRecord, result.paths.stylesDirPath),
    };
  }

  function loadFontIndex(mainPath) {
    const paths = ensureBaseDirectories(mainPath);
    const fonts = filterValidRecords(
      readJsonFile(paths.fontsIndexPath, []),
      normalizeFontRecord,
      paths.fontsDirPath,
    );
    writeJsonFile(paths.fontsIndexPath, fonts);
    return {
      paths,
      fonts,
    };
  }

  function loadConfig(mainPath) {
    const styleState = loadStyleIndex(mainPath);
    const fontState = loadFontIndex(mainPath);
    return {
      rootPath: styleState.paths.rootPath,
      styles: styleState.styles,
      fonts: fontState.fonts,
    };
  }

  function readStyleFile(mainPath, styleId) {
    const styleState = loadStyleIndex(mainPath);
    const target = styleState.styles.find(function (item) {
      return item.id === styleId;
    });
    if (!target) {
      throw new Error(`Style not found: ${styleId}`);
    }

    const stylePath = `${styleState.paths.stylesDirPath}/${target.fileName}`;
    const data = NSData.dataWithContentsOfFile(stylePath);
    if (!data) {
      throw new Error(`Style file missing: ${stylePath}`);
    }

    return {
      style: target,
      cssText: stringFromData(data),
      path: stylePath,
    };
  }

  function createDefaultStyleCss(styleName) {
    return [
      ":root {",
      "  --preview-page-bg: #ffffff;",
      "  --preview-text-color: #182018;",
      "  --preview-heading-color: #122418;",
      "  --preview-accent-color: #1f6a49;",
      "}",
      "",
      ".content-html {",
      "  line-height: 1.7;",
      "}",
      "",
      ".content-section h4 {",
      `  letter-spacing: 0.01em; /* ${String(styleName || "新样式")} */`,
      "}",
    ].join("\n");
  }

  function saveStyleFile(mainPath, payload) {
    const styleState = loadStyleIndex(mainPath);
    const styles = styleState.styles.slice();
    const cssText = String(payload.cssText || createDefaultStyleCss(payload.name));
    const styleName = String(payload.name || "新样式").trim() || "新样式";
    const existingId = payload.id ? String(payload.id) : "";
    const existingIndex = styles.findIndex(function (item) {
      return item.id === existingId;
    });

    if (existingIndex >= 0 && styles[existingIndex].builtin) {
      throw new Error(`Builtin style cannot be overwritten directly: ${existingId}`);
    }

    if (existingIndex >= 0) {
      const existing = styles[existingIndex];
      const nextRecord = {
        id: existing.id,
        name: styleName,
        fileName: existing.fileName,
        builtin: false,
        createdAt: existing.createdAt,
        updatedAt: nowIsoString(),
      };
      const stylePath = `${styleState.paths.stylesDirPath}/${nextRecord.fileName}`;
      writeTextFile(stylePath, cssText);
      styles.splice(existingIndex, 1, nextRecord);
      writeJsonFile(styleState.paths.stylesIndexPath, styles);
      return {
        style: nextRecord,
        cssText,
      };
    }

    const styleId = `style-${uuidString()}`;
    const safeFileName = sanitizeFileName(`${styleId}.css`, styleId, ".css");
    const record = {
      id: styleId,
      name: styleName,
      fileName: safeFileName,
      builtin: false,
      createdAt: nowIsoString(),
      updatedAt: nowIsoString(),
    };
    const targetPath = `${styleState.paths.stylesDirPath}/${record.fileName}`;
    writeTextFile(targetPath, cssText);
    styles.push(record);
    writeJsonFile(styleState.paths.stylesIndexPath, styles);
    return {
      style: record,
      cssText,
    };
  }

  function deleteStyleFile(mainPath, styleId) {
    const styleState = loadStyleIndex(mainPath);
    const styles = styleState.styles.slice();
    const targetIndex = styles.findIndex(function (item) {
      return item.id === styleId;
    });
    if (targetIndex < 0) {
      throw new Error(`Style not found: ${styleId}`);
    }
    if (styles[targetIndex].builtin) {
      throw new Error(`Builtin style cannot be deleted: ${styleId}`);
    }

    const target = styles[targetIndex];
    const stylePath = `${styleState.paths.stylesDirPath}/${target.fileName}`;
    const trashPath = moveToTrash(stylePath, styleState.paths.styleTrashDirPath);
    styles.splice(targetIndex, 1);
    writeJsonFile(styleState.paths.stylesIndexPath, styles);
    return {
      style: target,
      trashPath,
    };
  }

  function readFontFile(mainPath, fontId) {
    const fontState = loadFontIndex(mainPath);
    const target = fontState.fonts.find(function (item) {
      return item.id === fontId;
    });
    if (!target) {
      throw new Error(`Font not found: ${fontId}`);
    }

    const fontPath = `${fontState.paths.fontsDirPath}/${target.fileName}`;
    const data = NSData.dataWithContentsOfFile(fontPath);
    if (!data) {
      throw new Error(`Font file missing: ${fontPath}`);
    }

    const base64Value = typeof data.base64Encoding === "function" ? data.base64Encoding() : data.base64Encoding;

    return {
      font: target,
      base64: String(base64Value || ""),
      mimeType: inferMimeTypeFromExtension(target.fileName),
      path: fontPath,
    };
  }

  function saveFontRecord(mainPath, input) {
    const fontState = loadFontIndex(mainPath);
    const fonts = fontState.fonts.slice();
    const fontId = `font-${uuidString()}`;
    const originalFileName = sanitizeFileName(input.originalFileName, fontId, ".ttf");
    const targetPath = uniqueTargetPath(fontState.paths.fontsDirPath, originalFileName);
    const moved = fileManager().moveItemAtPathToPath(input.tempPath, targetPath);
    if (!moved) {
      throw new Error(`Failed to move font file into config directory: ${input.tempPath}`);
    }

    const record = {
      id: fontId,
      family: String(input.family || "").trim() || originalFileName.replace(/\.[^.]+$/, ""),
      weight: Number(input.weight || 400),
      style: String(input.style || "normal"),
      fileName: targetPath.split("/").pop(),
      createdAt: nowIsoString(),
      updatedAt: nowIsoString(),
    };

    fonts.push(record);
    writeJsonFile(fontState.paths.fontsIndexPath, fonts);
    return {
      font: record,
      path: targetPath,
    };
  }

  function deleteFontFile(mainPath, fontId) {
    const fontState = loadFontIndex(mainPath);
    const fonts = fontState.fonts.slice();
    const targetIndex = fonts.findIndex(function (item) {
      return item.id === fontId;
    });
    if (targetIndex < 0) {
      throw new Error(`Font not found: ${fontId}`);
    }

    const target = fonts[targetIndex];
    const fontPath = `${fontState.paths.fontsDirPath}/${target.fileName}`;
    const trashPath = moveToTrash(fontPath, fontState.paths.fontTrashDirPath);
    fonts.splice(targetIndex, 1);
    writeJsonFile(fontState.paths.fontsIndexPath, fonts);
    return {
      font: target,
      trashPath,
    };
  }

  return {
    loadConfig: loadConfig,
    readStyleFile: readStyleFile,
    saveStyleFile: saveStyleFile,
    deleteStyleFile: deleteStyleFile,
    readFontFile: readFontFile,
    saveFontRecord: saveFontRecord,
    deleteFontFile: deleteFontFile,
    configPaths: configPaths,
  };
})();
