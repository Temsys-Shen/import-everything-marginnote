import MNBridge from "../lib/mnBridge";
import { transferBinaryToBridge } from "./binaryTransferService";

const COMMANDS = {
  LOAD_CONFIG: "loadExportConfig",
  READ_STYLE: "readStyleFile",
  SAVE_STYLE: "saveStyleFile",
  DELETE_STYLE: "deleteStyleFile",
  READ_FONT: "readFontFile",
  SAVE_FONT_INIT: "saveFontInit",
  SAVE_FONT_CHUNK: "saveFontChunk",
  SAVE_FONT_FINALIZE: "saveFontFinalize",
  SAVE_FONT_ABORT: "saveFontAbort",
  DELETE_FONT: "deleteFontFile",
  SHOW_ALERT: "showAlertMessage",
};

function ensureBridgeOk(response, commandName) {
  if (!response || response.ok !== true) {
    throw new Error(response && response.message ? response.message : `${commandName} failed`);
  }
  return response.data;
}

function normalizeFontExtension(fileName) {
  const match = String(fileName || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

export function sanitizePdfFileName(name) {
  const normalized = String(name || "Export").trim().replace(/[\\/:*?"<>|]/g, "_");
  if (!normalized) {
    return "Export.pdf";
  }
  return normalized.toLowerCase().endsWith(".pdf") ? normalized : `${normalized}.pdf`;
}

export function buildAutoExportFileName(selectedFiles) {
  if (!selectedFiles || selectedFiles.length === 0) {
    return "ImportEverything.pdf";
  }

  const firstName = String(selectedFiles[0].name || "ImportEverything").replace(/\.[^.]+$/, "");
  return sanitizePdfFileName(firstName || "ImportEverything");
}

export function inferFontDraft(file) {
  const baseName = String(file && file.name ? file.name : "NewFont").replace(/\.[^.]+$/, "");
  const lowerName = baseName.toLowerCase();
  const weight = lowerName.includes("bold") ? 700 : lowerName.includes("light") ? 300 : 400;
  const style = lowerName.includes("italic") || lowerName.includes("oblique") ? "italic" : "normal";

  return {
    family: baseName
      .replace(/[-_]+/g, " ")
      .replace(/\b(bold|light|italic|oblique|regular)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim() || "New Font",
    weight,
    style,
  };
}

async function loadFontBinary(fontMeta) {
  const response = await MNBridge.send(COMMANDS.READ_FONT, {
    fontId: fontMeta.id,
  });
  const data = ensureBridgeOk(response, COMMANDS.READ_FONT);

  return {
    ...fontMeta,
    base64: data.base64,
    mimeType: data.mimeType,
  };
}

export async function loadExportConfigBundle() {
  const response = await MNBridge.send(COMMANDS.LOAD_CONFIG, {});
  const data = ensureBridgeOk(response, COMMANDS.LOAD_CONFIG);
  const fonts = await Promise.all((data.fonts || []).map(loadFontBinary));

  return {
    rootPath: data.rootPath,
    styles: Array.isArray(data.styles) ? data.styles : [],
    fonts,
  };
}

export async function readStylePreset(styleId) {
  const response = await MNBridge.send(COMMANDS.READ_STYLE, {
    styleId,
  });
  return ensureBridgeOk(response, COMMANDS.READ_STYLE);
}

export async function saveStylePreset(payload) {
  const response = await MNBridge.send(COMMANDS.SAVE_STYLE, payload);
  return ensureBridgeOk(response, COMMANDS.SAVE_STYLE);
}

export async function deleteStylePreset(styleId) {
  const response = await MNBridge.send(COMMANDS.DELETE_STYLE, {
    styleId,
  });
  return ensureBridgeOk(response, COMMANDS.DELETE_STYLE);
}

export async function uploadFontAsset(options) {
  const {
    file,
    family,
    weight,
    style,
    onProgress,
  } = options;

  const bytes = new Uint8Array(await file.arrayBuffer());
  return transferBinaryToBridge({
    bytes,
    fileName: file.name,
    mimeType: `font/${normalizeFontExtension(file.name) || "ttf"}`,
    commands: {
      init: COMMANDS.SAVE_FONT_INIT,
      chunk: COMMANDS.SAVE_FONT_CHUNK,
      finalize: COMMANDS.SAVE_FONT_FINALIZE,
      abort: COMMANDS.SAVE_FONT_ABORT,
    },
    buildFinalizePayload({ sessionId, totalChunks, expectedByteLength }) {
      return {
        sessionId,
        totalChunks,
        expectedByteLength,
        family,
        weight,
        style,
      };
    },
    onProgress,
  });
}

export async function deleteFontAsset(fontId) {
  const response = await MNBridge.send(COMMANDS.DELETE_FONT, {
    fontId,
  });
  return ensureBridgeOk(response, COMMANDS.DELETE_FONT);
}

export async function showAlertMessage(message) {
  const response = await MNBridge.send(COMMANDS.SHOW_ALERT, {
    message,
  });
  return ensureBridgeOk(response, COMMANDS.SHOW_ALERT);
}
