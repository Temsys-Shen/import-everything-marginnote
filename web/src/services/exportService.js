import dompdf from "dompdf.js";
import songtiScBlackBase64 from "jspdf-font/fonts/SongtiSCBlack";
import MNBridge from "../lib/mnBridge";

const BRIDGE_COMMANDS = {
  INIT: "savePdfInit",
  CHUNK: "savePdfChunk",
  FINALIZE: "savePdfFinalize",
  ABORT: "savePdfAbort",
};

const DEFAULT_MAX_CHUNK_CHARS = 16000;
const PDF_FONT_FAMILY = "SongtiSCBlack";

const PDF_FONT_CONFIG = [
  {
    fontFamily: PDF_FONT_FAMILY,
    fontBase64: songtiScBlackBase64,
    fontStyle: "normal",
    fontWeight: 400,
  },
  {
    fontFamily: PDF_FONT_FAMILY,
    fontBase64: songtiScBlackBase64,
    fontStyle: "normal",
    fontWeight: 700,
  },
];

function createExportError({ command, chunkIndex = null, message, details = null }) {
  return {
    command,
    chunkIndex,
    message,
    details,
  };
}

function sanitizeFileName(name) {
  const normalized = String(name || "export").replace(/[\\/:*?"<>|]/g, "_");
  if (normalized.toLowerCase().endsWith(".pdf")) {
    return normalized;
  }
  return `${normalized}.pdf`;
}

function uint8ToBase64(bytes) {
  const step = 0x8000;
  const parts = [];

  for (let i = 0; i < bytes.length; i += step) {
    const chunk = bytes.subarray(i, i + step);
    parts.push(String.fromCharCode(...chunk));
  }

  return btoa(parts.join(""));
}

function splitByLength(input, maxLength) {
  if (!input || input.length === 0) {
    return [];
  }

  const result = [];
  for (let i = 0; i < input.length; i += maxLength) {
    result.push(input.slice(i, i + maxLength));
  }
  return result;
}

async function generatePdfBlobFromElement(element) {
  const previousInlineFontFamily = element.style.fontFamily;
  element.style.fontFamily = PDF_FONT_FAMILY;

  let renderResult;
  try {
    renderResult = await dompdf(element, {
      useCORS: true,
      backgroundColor: "#ffffff",
      pagination: true,
      format: "a4",
      fontConfig: PDF_FONT_CONFIG,
    });
  } finally {
    element.style.fontFamily = previousInlineFontFamily;
  }

  if (renderResult instanceof Blob) {
    return renderResult;
  }

  throw createExportError({
    command: "generatePdf",
    message: "dompdf did not return a PDF Blob",
  });
}

export async function exportMergedPreviewToDocumentPath(options) {
  const {
    rootElement,
    fileName,
    onProgress,
  } = options;

  if (!rootElement) {
    throw createExportError({
      command: "generatePdf",
      message: "Missing printable root element",
    });
  }

  if (typeof onProgress === "function") {
    onProgress({ stage: "render", message: "正在使用dompdf.js生成PDF二进制" });
  }

  const pdfBlob = await generatePdfBlobFromElement(rootElement);
  const bytes = new Uint8Array(await pdfBlob.arrayBuffer());
  const base64 = uint8ToBase64(bytes);

  const initPayload = {
    fileName: sanitizeFileName(fileName),
    mimeType: "application/pdf",
    expectedByteLength: bytes.length,
    totalChunks: 0,
  };

  const initResponse = await MNBridge.send(BRIDGE_COMMANDS.INIT, initPayload);
  if (!initResponse || initResponse.ok !== true) {
    throw createExportError({
      command: BRIDGE_COMMANDS.INIT,
      message: initResponse && initResponse.message ? initResponse.message : "savePdfInit failed",
      details: initResponse,
    });
  }

  const sessionId = initResponse.data.sessionId;
  const maxChunkChars = Math.max(
    1024,
    Math.min(
      DEFAULT_MAX_CHUNK_CHARS,
      Number(initResponse.data.maxChunkChars || DEFAULT_MAX_CHUNK_CHARS),
    ),
  );
  const chunks = splitByLength(base64, maxChunkChars);

  try {
    for (let i = 0; i < chunks.length; i += 1) {
      const chunkPayload = {
        sessionId,
        chunkIndex: i,
        base64Chunk: chunks[i],
        chunkCharLength: chunks[i].length,
      };

      const response = await MNBridge.send(BRIDGE_COMMANDS.CHUNK, chunkPayload);
      if (!response || response.ok !== true) {
        throw createExportError({
          command: BRIDGE_COMMANDS.CHUNK,
          chunkIndex: i,
          message: response && response.message ? response.message : "savePdfChunk failed",
          details: response,
        });
      }

      if (typeof onProgress === "function") {
        onProgress({
          stage: "transfer",
          command: BRIDGE_COMMANDS.CHUNK,
          chunkIndex: i,
          totalChunks: chunks.length,
          message: `正在传输分片${i + 1}/${chunks.length}`,
        });
      }
    }

    const finalizePayload = {
      sessionId,
      totalChunks: chunks.length,
      expectedByteLength: bytes.length,
      fileName: sanitizeFileName(fileName),
      mimeType: "application/pdf",
    };

    const finalResponse = await MNBridge.send(BRIDGE_COMMANDS.FINALIZE, finalizePayload);
    if (!finalResponse || finalResponse.ok !== true) {
      throw createExportError({
        command: BRIDGE_COMMANDS.FINALIZE,
        message: finalResponse && finalResponse.message ? finalResponse.message : "savePdfFinalize failed",
        details: finalResponse,
      });
    }

    if (typeof onProgress === "function") {
      onProgress({
        stage: "done",
        command: BRIDGE_COMMANDS.FINALIZE,
        message: "已保存到文档目录并导入文档库",
      });
    }

    return finalResponse;
  } catch (error) {
    try {
      await MNBridge.send(BRIDGE_COMMANDS.ABORT, {
        sessionId,
        reason: error && error.message ? error.message : String(error),
      });
    } catch (abortError) {
      // keep original error
    }

    throw error;
  }
}
